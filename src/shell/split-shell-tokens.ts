// A word keeps its raw text beside its value with the quotes removed. A
// backslash keeps the character after it out of every operator, and both stay
// in the value. Offsets index the scanned text, end exclusive.
type ShellToken =
  | {
      readonly kind: 'word';
      readonly value: string;
      readonly raw: string;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly kind: 'separator';
      readonly operator: string;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly kind: 'redirect';
      readonly operator: string;
      readonly target: string | null;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly kind: 'comment';
      readonly text: string;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly kind: 'heredoc';
      readonly body: string;
      readonly isQuoted: boolean;
      readonly opener: number;
      readonly substitutions: readonly string[];
      readonly start: number;
      readonly end: number;
    };

export interface ShellTokens {
  readonly tokens: readonly ShellToken[];
  readonly substitutions: readonly string[];
  readonly hasSubstitution: boolean;
  readonly isUnterminated: boolean;
}

// The one shell scanner. A quote or substitution that never closes stops the
// tokens, but the bodies are read again with it as one literal character, so
// a later substitution is not lost.
export function splitShellTokens(text: string): ShellTokens {
  const scanned = collectTextTokens(text, []);
  const literals: number[] = [];
  let recovered = scanned;

  while (recovered.unclosedAt !== null && !literals.includes(recovered.unclosedAt)) {
    literals.push(recovered.unclosedAt);

    recovered = collectTextTokens(text, literals);
  }

  return {
    tokens: scanned.tokens,
    substitutions: recovered.substitutions,
    hasSubstitution: scanned.hasSubstitution,
    isUnterminated: scanned.unclosedAt !== null,
  };
}

interface TextTokens {
  readonly tokens: readonly ShellToken[];
  readonly substitutions: readonly string[];
  readonly hasSubstitution: boolean;
  readonly unclosedAt: number | null;
}

// One level of nesting: the top level, a `$(…)` body, or a heredoc body.
interface Level {
  readonly substitutions: string[];
  readonly limit: number;
  readonly closer: ')' | null;
  depth: number;
}

// Every helper reads and updates the state of one scan, so each closes over
// it. `literals` holds the offsets read as plain characters, and `unclosedAt`
// the first construct that never closes.
function collectTextTokens(text: string, literalOffsets: readonly number[]): TextTokens {
  const literals: ReadonlySet<number> = new Set(literalOffsets);

  const top = buildLevel(text.length, null);
  let level = top;
  let hasSubstitution = false;
  let unclosedAt: number | null = null;

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

  // At a level with a closer, `end` is the offset of that closer, or -1 when
  // the text ends first.
  const collectTokens = (start: number): { tokens: ShellToken[]; end: number } => {
    const tokens: ShellToken[] = [];
    const heredocs: Heredoc[] = [];
    let isArithmetic = false;
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
          const read = readHeredocs(index, heredocs.splice(0));

          tokens.push(...read.tokens);

          index = read.end;
        }

        continue;
      }

      const word = readWord(index);
      const operator = findOperator(REDIRECTS, text, word.end);
      const isDescriptor = operator !== undefined && /^\d+$/u.test(word.raw);

      if (word.raw !== '' && !isDescriptor) {
        tokens.push(buildWordToken(word, index));

        isArithmetic = (isArithmetic || word.raw.startsWith('((')) && !word.raw.endsWith('))');

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

      const redirect = readRedirect(word.end, operator);

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

      // Inside `(( … ))`, up to its closing word, a `<<` shifts bits and opens
      // no heredoc, even after a `&` or `|` there.
      if ((operator === '<<' || operator === '<<-') && redirect.raw !== '' && !isArithmetic) {
        heredocs.push(buildHeredoc(redirect.raw, operator === '<<-', index));
      }

      isArithmetic &&= !text.slice(index, redirect.end).endsWith('))');
      index = redirect.end;
    }

    return { tokens, end: level.closer === null ? index : -1 };
  };

  // A word ends at whitespace or at an operator outside quotes. A substitution
  // or `${…}` expansion stays inside the word it starts in, so `$(…)#L1` holds
  // no comment, while a `#` right after a grouping parenthesis starts one.
  const readWord = (start: number): ScannedWord => {
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
        const quoted = readQuoted(quoteAt, isANSI);

        value += `${isANSI ? '$' : ''}${quoted.value}`;
        index = quoted.end;

        if (quoted.isUnterminated) {
          return buildScannedWord(text, start, index, value, paren, true);
        }

        continue;
      }

      if (text.startsWith('$$', index)) {
        value += '$$';
        index += 2;
        continue;
      }

      const expansion = readExpansion(index, false);

      if (expansion !== null) {
        value += text.slice(index, expansion.end);
        index = expansion.end;

        if (expansion.isUnterminated) {
          return buildScannedWord(text, start, index, value, paren, true);
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

        paren ??= { value: value.length, raw: index - start };
        parenEnd = index + 1;
      }

      value += ch;
      index += 1;
    }

    return buildScannedWord(text, start, Math.min(index, level.limit), value, paren, false);
  };

  // A double-quoted string still expands `$(…)`, backticks and `${…}`, and a
  // backslash there escapes the next character. `$'…'` lets a backslash escape
  // the closing quote; a plain single quote does not.
  const readQuoted = (
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
        const expansion = quote === '"' ? readExpansion(index, true) : null;
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

  // `$(…)` and backticks run a command, whose body joins the level's
  // substitutions; `${…}` holds parameter text that can hold either.
  const readExpansion = (
    index: number,
    isInDoubleQuotes: boolean,
  ): { end: number; isUnterminated: boolean } | null => {
    if (text.startsWith('$(', index) || text.charAt(index) === '`') {
      hasSubstitution = true;

      const isBacktick = text.charAt(index) === '`';
      const bodyStart = index + (isBacktick ? 1 : 2);

      const end = isBacktick
        ? findBacktickEnd(bodyStart)
        : withLevel(level.limit, ')', () => collectTokens(bodyStart).end).result;

      return collectExpansionBody(index, bodyStart, end);
    }

    if (text.startsWith('${', index)) {
      return collectExpansionBody(index, -1, findParameterEnd(index + 2, isInDoubleQuotes));
    }

    return null;
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
  const findBacktickEnd = (start: number): number => {
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
  const findParameterEnd = (start: number, isInDoubleQuotes: boolean): number => {
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

      const expansion = readExpansion(index, isInDoubleQuotes || isDoubleQuoted);

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

  // The target is the next word. A target stops short at an unquoted parenthesis,
  // so `(echo x > out)` writes `out`, while the redirection still takes the
  // whole word. A process substitution runs its body as a command.
  const readRedirect = (start: number, operator: string): ScannedRedirect => {
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

    const word = readWord(index);

    if (word.raw === '') {
      return { target: null, raw: '', end: index, isUnterminated: false };
    }

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
  const readHeredocs = (
    start: number,
    heredocs: readonly Heredoc[],
  ): { tokens: ShellToken[]; end: number } => {
    const tokens: ShellToken[] = [];
    let bodyStart = start;
    let end = start;

    for (const heredoc of heredocs) {
      const [bodyEnd, next] = findHeredocEnd(text, bodyStart, level.limit, heredoc);
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
          index = readExpansion(index, true)?.end ?? index + 1;
        }
      }
    }).substitutions;

  const tokens = collectTokens(0).tokens;

  return { tokens, substitutions: top.substitutions, hasSubstitution, unclosedAt };
}

function buildLevel(limit: number, closer: ')' | null): Level {
  return { substitutions: [], limit, closer, depth: 0 };
}

const SEPARATORS = ['&&', '||', ';', '|', '&', '\n'];

// Longest first, so `>>` is read before `>`.
const REDIRECTS = [
  '&>>',
  '&>',
  '<<<',
  '<<-',
  '<<',
  '<&',
  '<>',
  '<(',
  '<',
  '>>',
  '>|',
  '>&',
  '>(',
  '>',
];

function findOperator(
  operators: readonly string[],
  text: string,
  index: number,
): string | undefined {
  return operators.find((operator) => text.startsWith(operator, index));
}

// The first unquoted parenthesis, as an offset into the value and the raw text.
interface WordParen {
  readonly value: number;
  readonly raw: number;
}

interface ScannedWord {
  readonly value: string;
  readonly raw: string;
  readonly end: number;
  readonly paren: WordParen | null;
  readonly isUnterminated: boolean;
}

function buildWordToken(word: Readonly<ScannedWord>, start: number): ShellToken {
  return { kind: 'word', value: word.value, raw: word.raw, start, end: word.end };
}

function buildScannedWord(
  text: string,
  start: number,
  end: number,
  value: string,
  paren: WordParen | null,
  isUnterminated: boolean,
): ScannedWord {
  return { value, raw: text.slice(start, end), end, paren, isUnterminated };
}

interface ScannedRedirect {
  readonly target: string | null;
  readonly raw: string;
  readonly end: number;
  readonly isUnterminated: boolean;
}

interface Heredoc {
  readonly delimiter: string;
  readonly isQuoted: boolean;
  readonly stripsTabs: boolean;
  readonly opener: number;
}

// Any quote or escape in the word turns substitution off for the body. The
// delimiter is the word after quote removal, so a single-quoted backslash
// stays and a line continuation outside single quotes joins the word.
function buildHeredoc(raw: string, stripsTabs: boolean, opener: number): Heredoc {
  let delimiter = '';
  let quote: "'" | '"' | null = null;
  let isQuoted = false;
  let index = 0;

  while (index < raw.length) {
    const ch = raw.charAt(index);
    const next = raw.charAt(index + 1);

    if (quote === "'") {
      quote = ch === "'" ? null : quote;
      delimiter += ch === "'" ? '' : ch;
      index += 1;
    } else if (ch === quote) {
      quote = null;
      index += 1;
    } else if (ch === '\\' && (quote === null || /[$`"\\\n]/u.test(next))) {
      isQuoted ||= next !== '\n';
      delimiter += next === '\n' ? '' : next;
      index += 2;
    } else if (quote === null && (ch === "'" || ch === '"')) {
      quote = ch;
      isQuoted = true;
      index += 1;
    } else {
      delimiter += ch;
      index += 1;
    }
  }

  return { delimiter, isQuoted, stripsTabs, opener };
}

function findHeredocEnd(
  text: string,
  bodyStart: number,
  limit: number,
  heredoc: Heredoc,
): [number, number] {
  let lineStart = bodyStart;

  while (lineStart < limit) {
    let lineEnd = findLineEnd(text, lineStart, limit);
    let line = text.slice(lineStart, lineEnd);

    // In an unquoted body the shell joins a line that ends in a line
    // continuation to the next one before it compares the delimiter.
    while (!heredoc.isQuoted && /(?<!\\)(?:\\\\)*\\$/u.test(line) && lineEnd < limit) {
      const nextEnd = findLineEnd(text, lineEnd + 1, limit);

      line = `${line.slice(0, -1)}${text.slice(lineEnd + 1, nextEnd)}`;
      lineEnd = nextEnd;
    }

    if ((heredoc.stripsTabs ? line.replace(/^\t+/u, '') : line) === heredoc.delimiter) {
      return [lineStart, lineEnd];
    }

    lineStart = lineEnd + 1;
  }

  return [limit, limit];
}

function findLineEnd(text: string, start: number, limit: number): number {
  const newline = text.indexOf('\n', start);

  return newline === -1 || newline > limit ? limit : newline;
}
