import { buildHeredoc } from './build-heredoc.ts';
import { REDIRECTS, SEPARATORS, findOperator } from './find-operator.ts';
import { getHeredocEnd } from './get-heredoc-end.ts';
import type { Heredoc, ScannedRedirect, ScannedWord, ShellToken, WordParen } from './types.ts';

export interface TextTokens {
  readonly tokens: readonly ShellToken[];
  readonly substitutions: readonly string[];
  readonly hasSubstitution: boolean;
  readonly unclosedAt: number | null;
}

interface CommandSubstitutionScan {
  readonly end: number;
  readonly isUnterminated: boolean;
  readonly substitutions: readonly string[];
  readonly unclosedAt: number | null;
}

export function collectTextTokens(text: string, literalOffsets: readonly number[]): TextTokens {
  const literals: ReadonlySet<number> = new Set(literalOffsets);

  const top = buildLevel(text.length, null);
  let level = top;
  let hasSubstitution = false;
  let unclosedAt: number | null = null;

  const commandSubstitutions = new Map<string, CommandSubstitutionScan>();

  const withLevel = <T>(
    limit: number,
    closer: ')' | null,
    run: () => T,
  ): { readonly result: T; readonly substitutions: readonly string[] } => {
    const outer = level;
    const inner = buildLevel(limit, closer);

    level = inner;

    const result = run();

    level = outer;

    return { result, substitutions: inner.substitutions };
  };

  const collectTokens = (
    start: number,
    isArithmeticStart = false,
  ): { tokens: ShellToken[]; end: number } => {
    const tokens: ShellToken[] = [];
    const heredocs: Heredoc[] = [];
    let arithmeticDepth = isArithmeticStart ? 1 : 0;
    let index = start;

    while (index < level.limit) {
      const ch = text.charAt(index);
      const isLiteral = literals.has(index);

      if (!isLiteral && ch === level.closer && level.depth === 0) {
        return { tokens, end: index };
      }

      if (text.startsWith('\\\n', index)) {
        index += 2;
        continue;
      }

      if (/\s/u.test(ch) && ch !== '\n') {
        index += 1;
        continue;
      }

      if (ch === '#') {
        const newline = text.indexOf('\n', index);
        const end = newline === -1 || newline > level.limit ? level.limit : newline;

        tokens.push({ kind: 'comment', text: text.slice(index, end), start: index, end });

        index = end;
        continue;
      }

      const separator = isLiteral ? undefined : findOperator(SEPARATORS, text, index);

      if (separator !== undefined && !text.startsWith('&>', index)) {
        tokens.push({
          kind: 'separator',
          operator: separator,
          start: index,
          end: index + separator.length,
        });

        index += separator.length;

        if (separator === '\n' && heredocs.length > 0) {
          const read = parseHeredocs(index, heredocs.splice(0));

          tokens.push(...read.tokens);

          index = read.end;
        }

        continue;
      }

      const balance = level.balance;
      const word = parseWord(index);
      const operator = findOperator(REDIRECTS, text, word.end);
      const isDescriptor = operator !== undefined && /^\d+$/u.test(word.raw);

      if (word.raw !== '' && !isDescriptor) {
        tokens.push(buildWordToken(word, index));

        if (arithmeticDepth > 0 || word.raw.startsWith('((')) {
          arithmeticDepth += level.balance - balance;
        }

        if (word.isUnterminated) {
          return { tokens, end: -1 };
        }

        index = word.end;
        continue;
      }

      if (operator === undefined) {
        index += 1;
        continue;
      }

      // Inside `(( … ))`, up to its closing word, a `<<` shifts bits and opens
      // no heredoc, even after a `&` or `|` there.
      const opensHeredoc = (operator === '<<' || operator === '<<-') && arithmeticDepth <= 0;
      const redirect = parseRedirect(word.end, operator, opensHeredoc);

      tokens.push({
        kind: 'redirect',
        operator: `${word.raw}${operator}`,
        target: redirect.target,
        start: index,
        end: redirect.end,
      });

      if (redirect.isUnterminated) {
        return { tokens, end: -1 };
      }

      if (opensHeredoc && redirect.raw !== '') {
        heredocs.push(buildHeredoc(redirect.raw, operator === '<<-', index));
      }

      if (arithmeticDepth > 0) {
        arithmeticDepth += level.balance - balance;
      }

      index = redirect.end;
    }

    return { tokens, end: level.closer === null ? index : -1 };
  };

  // A substitution or `${…}` expansion stays inside the word it starts in, so
  // `$(…)#L1` holds no comment, while a `#` right after a grouping parenthesis
  // starts one.
  const parseWord = (start: number): ScannedWord => {
    let value = '';
    let paren: WordParen | null = null;
    let parenEnd = -1;
    let index = start;

    while (index < level.limit) {
      const ch = text.charAt(index);

      if (literals.has(index)) {
        value += ch;
        index += 1;
        continue;
      }

      if (ch === '\\') {
        value += text.slice(index, index + 2);
        index += 2;
        continue;
      }

      if (ch === "'" || ch === '"' || (text.startsWith("$'", index) && !literals.has(index + 1))) {
        const isANSI = ch === '$';
        const quoteAt = isANSI ? index + 1 : index;
        const quoted = parseQuoted(quoteAt, isANSI);

        value += `${isANSI ? '$' : ''}${quoted.value}`;
        index = quoted.end;

        if (quoted.isUnterminated) {
          return buildScannedWord(text, start, index, { value, paren, isUnterminated: true });
        }

        continue;
      }

      if (text.startsWith('$$', index)) {
        value += '$$';
        index += 2;
        continue;
      }

      const expansion = parseExpansion(index, false);

      if (expansion !== null) {
        value += text.slice(index, expansion.end);
        index = expansion.end;

        if (expansion.isUnterminated) {
          return buildScannedWord(text, start, index, { value, paren, isUnterminated: true });
        }

        continue;
      }

      if (/\s/u.test(ch) || /[;&|<>]/u.test(ch) || (ch === '#' && index === parenEnd)) {
        break;
      }

      if (ch === '(' || ch === ')') {
        if (level.closer === ')' && ch === ')' && level.depth === 0) {
          break;
        }

        if (level.closer === ')') {
          level.depth += ch === '(' ? 1 : -1;
        }

        level.balance += ch === '(' ? 1 : -1;
        paren ??= { value: value.length, raw: index - start };
        parenEnd = index + 1;
      }

      value += ch;
      index += 1;
    }

    return buildScannedWord(text, start, Math.min(index, level.limit), {
      value,
      paren,
      isUnterminated: false,
    });
  };

  // A double-quoted string still expands `$(…)`, backticks and `${…}`, and a
  // backslash there escapes the next character. `$'…'` lets a backslash escape
  // the closing quote; a plain single quote does not.
  const parseQuoted = (
    start: number,
    isANSI: boolean,
  ): { value: string; end: number; isUnterminated: boolean } => {
    const quote = text.charAt(start);
    let value = '';
    let index = start + 1;

    while (index < level.limit) {
      const ch = text.charAt(index);

      if (literals.has(index)) {
        value += ch;
        index += 1;
      } else if (ch === quote) {
        return { value, end: index + 1, isUnterminated: false };
      } else if (ch === '\\' && (quote === '"' || isANSI)) {
        value += text.slice(index, index + 2);
        index += 2;
      } else {
        const expansion = quote === '"' ? parseExpansion(index, true) : null;
        const end = expansion?.end ?? index + 1;

        value += text.slice(index, end);
        index = end;

        if (expansion?.isUnterminated === true) {
          return { value, end: index, isUnterminated: true };
        }
      }
    }

    unclosedAt ??= start;

    return { value, end: level.limit, isUnterminated: true };
  };

  const parseExpansion = (
    index: number,
    isInDoubleQuotes: boolean,
  ): { end: number; isUnterminated: boolean } | null => {
    if (text.startsWith('$(', index) || text.charAt(index) === '`') {
      hasSubstitution = true;

      const isBacktick = text.charAt(index) === '`';
      const bodyStart = index + (isBacktick ? 1 : 2);

      if (isBacktick) {
        return collectExpansionBody(index, bodyStart, getBacktickEnd(bodyStart));
      }

      return parseCommandSubstitution(index, bodyStart);
    }

    // `${…}` runs nothing itself, but its parameter text can hold a substitution.
    if (text.startsWith('${', index)) {
      return collectExpansionBody(index, -1, getParameterEnd(index + 2, isInDoubleQuotes));
    }

    return null;
  };

  const parseCommandSubstitution = (
    index: number,
    bodyStart: number,
  ): { end: number; isUnterminated: boolean } => {
    const key = `${index}:${level.limit}`;
    const scan = commandSubstitutions.get(key);

    if (scan !== undefined) {
      level.substitutions.push(...scan.substitutions);

      unclosedAt ??= scan.unclosedAt;

      return { end: scan.end, isUnterminated: scan.isUnterminated };
    }

    const collected = level.substitutions.length;
    const wasUnclosed = unclosedAt !== null;
    const read = parseCommandSubstitutionBody(index, bodyStart);

    commandSubstitutions.set(key, {
      ...read,
      substitutions: level.substitutions.slice(collected),
      unclosedAt: wasUnclosed ? null : unclosedAt,
    });

    return read;
  };

  // Bash reads `$((…))` as arithmetic, which runs only the substitutions
  // inside it, when the inner parenthesis closes right before the outer
  // one; otherwise the body is a command that starts with a subshell.
  const parseCommandSubstitutionBody = (
    index: number,
    bodyStart: number,
  ): { end: number; isUnterminated: boolean } => {
    if (text.charAt(bodyStart) === '(') {
      const arithmetic = withLevel(level.limit, ')', () => collectTokens(bodyStart + 1, true).end);

      if (arithmetic.result !== -1 && text.charAt(arithmetic.result + 1) === ')') {
        level.substitutions.push(...arithmetic.substitutions);

        return { end: arithmetic.result + 2, isUnterminated: false };
      }
    }

    const end = withLevel(level.limit, ')', () => collectTokens(bodyStart).end).result;

    return collectExpansionBody(index, bodyStart, end);
  };

  const collectExpansionBody = (
    index: number,
    bodyStart: number,
    end: number,
  ): { end: number; isUnterminated: boolean } => {
    if (end === -1) {
      unclosedAt ??= index;

      return { end: level.limit, isUnterminated: true };
    }

    if (bodyStart !== -1) {
      level.substitutions.push(text.slice(bodyStart, end));
    }

    return { end: end + 1, isUnterminated: false };
  };

  // The shell ends a backtick body at the first unescaped backtick, before it
  // reads any quote.
  const getBacktickEnd = (start: number): number => {
    for (let index = start; index < level.limit; index += 1) {
      if (literals.has(index)) {
        continue;
      }

      if (text.charAt(index) === '\\') {
        index += 1;
      } else if (text.charAt(index) === '`') {
        return index;
      }
    }

    return -1;
  };

  // A single-quoted `}` closes nothing and a bare `{` is plain text. Within
  // double quotes a single quote is literal, so a substitution between single
  // quotes still runs.
  const getParameterEnd = (start: number, isInDoubleQuotes: boolean): number => {
    let isDoubleQuoted = false;
    let isSingleQuoted = false;
    let index = start;

    while (index < level.limit) {
      const ch = text.charAt(index);

      if (literals.has(index)) {
        index += 1;
        continue;
      }

      if (ch === '\\') {
        index += 2;
        continue;
      }

      const expansion = parseExpansion(index, isInDoubleQuotes || isDoubleQuoted);

      if (expansion !== null) {
        if (expansion.isUnterminated) {
          return -1;
        }

        index = expansion.end;
        continue;
      }

      if (ch === "'" && !isInDoubleQuotes && !isDoubleQuoted) {
        const close = text.indexOf("'", index + 1);

        if (close === -1 || close >= level.limit) {
          return -1;
        }

        index = close + 1;
        continue;
      }

      if (ch === "'" && !isDoubleQuoted) {
        isSingleQuoted = !isSingleQuoted;
      } else if (ch === '"' && !isSingleQuoted) {
        isDoubleQuoted = !isDoubleQuoted;
      } else if (!isDoubleQuoted && !isSingleQuoted && ch === '}') {
        return index;
      }

      index += 1;
    }

    return -1;
  };

  const parseRedirect = (
    start: number,
    operator: string,
    opensHeredoc: boolean,
  ): ScannedRedirect => {
    let index = start + operator.length;

    if (operator.endsWith('(')) {
      hasSubstitution = true;

      const expansion = collectExpansionBody(
        start,
        index,
        withLevel(level.limit, ')', () => collectTokens(index).end).result,
      );

      return { target: null, raw: '', ...expansion };
    }

    while (index < level.limit) {
      if (text.startsWith('\\\n', index)) {
        index += 2;
      } else if (/\s/u.test(text.charAt(index)) && text.charAt(index) !== '\n') {
        index += 1;
      } else {
        break;
      }
    }

    const collected = level.substitutions.length;
    const hadSubstitution = hasSubstitution;
    const word = parseWord(index);

    // Bash only removes quotes from a heredoc delimiter, so a substitution in
    // it never runs.
    if (opensHeredoc) {
      level.substitutions.splice(collected);

      hasSubstitution = hadSubstitution;
    }

    if (word.raw === '') {
      return { target: null, raw: '', end: index, isUnterminated: false };
    }

    // A target stops short at an unquoted parenthesis, so `(echo x > out)`
    // writes `out`, while the redirection still takes the whole word.
    return {
      target: word.paren === null ? word.value : word.value.slice(0, word.paren.value),
      raw: word.paren === null ? word.raw : word.raw.slice(0, word.paren.raw),
      end: word.end,
      isUnterminated: word.isUnterminated,
    };
  };

  // Each body starts on the line after the one that opened it and ends at the
  // line that holds only its delimiter; a body with no such line runs to the end.
  // Quotes are plain text in a body, so only a backslash and a substitution count.
  const parseHeredocs = (
    start: number,
    heredocs: readonly Heredoc[],
  ): { tokens: ShellToken[]; end: number } => {
    const tokens: ShellToken[] = [];
    let bodyStart = start;
    let end = start;

    for (const heredoc of heredocs) {
      const [bodyEnd, next] = getHeredocEnd(text, bodyStart, level.limit, heredoc);
      const substitutions = heredoc.isQuoted ? [] : collectHeredocSubstitutions(bodyStart, bodyEnd);

      tokens.push({
        kind: 'heredoc',
        body: text.slice(bodyStart, bodyEnd),
        isQuoted: heredoc.isQuoted,
        opener: heredoc.opener,
        substitutions,
        start: bodyStart,
        end: next,
      });

      level.substitutions.push(...substitutions);

      end = next;
      bodyStart = Math.min(next + 1, level.limit);
    }

    return { tokens, end };
  };

  const collectHeredocSubstitutions = (start: number, end: number): readonly string[] =>
    withLevel(end, null, () => {
      let index = start;

      while (index < end) {
        if (literals.has(index)) {
          index += 1;
        } else if (text.charAt(index) === '\\') {
          index += 2;
        } else {
          index = parseExpansion(index, true)?.end ?? index + 1;
        }
      }
    }).substitutions;

  const tokens = collectTokens(0).tokens;

  return { tokens, substitutions: top.substitutions, hasSubstitution, unclosedAt };
}

interface Level {
  readonly substitutions: string[];
  readonly limit: number;
  readonly closer: ')' | null;
  depth: number;

  balance: number;
}

function buildLevel(limit: number, closer: ')' | null): Level {
  return { substitutions: [], limit, closer, depth: 0, balance: 0 };
}

function buildWordToken(word: Readonly<ScannedWord>, start: number): ShellToken {
  return { kind: 'word', value: word.value, raw: word.raw, start, end: word.end };
}

interface ScannedWordOptions {
  readonly value: string;
  readonly paren: WordParen | null;
  readonly isUnterminated: boolean;
}

function buildScannedWord(
  text: string,
  start: number,
  end: number,
  options: Readonly<ScannedWordOptions>,
): ScannedWord {
  return {
    value: options.value,
    raw: text.slice(start, end),
    end,
    paren: options.paren,
    isUnterminated: options.isUnterminated,
  };
}
