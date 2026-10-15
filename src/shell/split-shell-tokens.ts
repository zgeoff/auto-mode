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
  const scanned = collectTextTokens(text, new Set());

  let literals: ReadonlySet<number> = new Set();

  let recovered = scanned;

  while (recovered.scanner.unclosedAt !== null && !literals.has(recovered.scanner.unclosedAt)) {
    literals = new Set([...literals, recovered.scanner.unclosedAt]);

    recovered = collectTextTokens(text, literals);
  }

  return {
    tokens: scanned.tokens,
    substitutions: recovered.substitutions,
    hasSubstitution: scanned.scanner.hasSubstitution,
    isUnterminated: scanned.scanner.unclosedAt !== null,
  };
}

// Shared by every level of one scan. `literals` holds the offsets read as
// plain characters, and `unclosedAt` the first construct that never closes.
interface Scanner {
  readonly text: string;
  readonly literals: ReadonlySet<number>;
  hasSubstitution: boolean;
  unclosedAt: number | null;
}

// One level of nesting: the top level, a `$(…)` body, or a heredoc body.
interface Level {
  readonly substitutions: string[];
  readonly limit: number;
  readonly closer: ')' | null;
  depth: number;
}

function collectTextTokens(
  text: string,
  literals: ReadonlySet<number>,
): { tokens: readonly ShellToken[]; substitutions: readonly string[]; scanner: Scanner } {
  const scanner: Scanner = { text, literals, hasSubstitution: false, unclosedAt: null };
  const level: Level = { substitutions: [], limit: text.length, closer: null, depth: 0 };

  return {
    tokens: collectTokens(scanner, level, 0).tokens,
    substitutions: level.substitutions,
    scanner,
  };
}

// At a level with a closer, `end` is the offset of that closer, or -1 when
// the text ends first.
function collectTokens(
  scanner: Scanner,
  level: Level,
  start: number,
): { tokens: ShellToken[]; end: number } {
  const text = scanner.text;
  const tokens: ShellToken[] = [];
  const heredocs: Heredoc[] = [];
  let isArithmetic = false;
  let index = start;

  while (index < level.limit) {
    const ch = text.charAt(index);
    const isLiteral = scanner.literals.has(index);

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
        index = readHeredocs(scanner, level, index, heredocs.splice(0), tokens);
      }

      continue;
    }

    const word = readWord(scanner, level, index);
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

    const redirect = readRedirect(scanner, level, word.end, operator);

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
      heredocs.push(buildHeredoc(redirect.raw, operator === '<<-'));
    }

    index = redirect.end;
  }

  return { tokens, end: level.closer === null ? index : -1 };
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

// A word ends at whitespace or at an operator outside quotes. A substitution
// or `${…}` expansion stays inside the word it starts in, so `$(…)#L1` holds
// no comment, while a `#` right after a grouping parenthesis starts one.
function readWord(scanner: Scanner, level: Level, start: number): ScannedWord {
  const text = scanner.text;
  let value = '';
  let paren: WordParen | null = null;
  let parenEnd = -1;
  let index = start;

  while (index < level.limit) {
    const ch = text.charAt(index);

    if (scanner.literals.has(index)) {
      value += ch;
      index += 1;
      continue;
    }

    if (ch === '\\') {
      value += text.slice(index, index + 2);
      index += 2;
      continue;
    }

    if (
      ch === "'" ||
      ch === '"' ||
      (text.startsWith("$'", index) && !scanner.literals.has(index + 1))
    ) {
      const isANSI = ch === '$';
      const quoteAt = isANSI ? index + 1 : index;
      const quoted = readQuoted(scanner, level, quoteAt, isANSI);

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

    const expansion = readExpansion(scanner, level, index);

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

// A double-quoted string still expands `$(…)`, backticks and `${…}`, and a
// backslash there escapes the next character. `$'…'` lets a backslash escape
// the closing quote; a plain single quote does not.
function readQuoted(
  scanner: Scanner,
  level: Level,
  start: number,
  isANSI: boolean,
): { value: string; end: number; isUnterminated: boolean } {
  const text = scanner.text;
  const quote = text.charAt(start);
  let value = '';
  let index = start + 1;

  while (index < level.limit) {
    const ch = text.charAt(index);

    if (scanner.literals.has(index)) {
      value += ch;
      index += 1;
    } else if (ch === quote) {
      return { value, end: index + 1, isUnterminated: false };
    } else if (ch === '\\' && (quote === '"' || isANSI)) {
      value += text.slice(index, index + 2);
      index += 2;
    } else {
      const expansion = quote === '"' ? readExpansion(scanner, level, index) : null;
      const end = expansion?.end ?? index + 1;

      value += text.slice(index, end);
      index = end;

      if (expansion?.isUnterminated === true) {
        return { value, end: index, isUnterminated: true };
      }
    }
  }

  scanner.unclosedAt ??= start;

  return { value, end: level.limit, isUnterminated: true };
}

// `$(…)` and backticks run a command, whose body joins the level's
// substitutions; `${…}` holds parameter text that can hold either.
function readExpansion(
  scanner: Scanner,
  level: Level,
  index: number,
): { end: number; isUnterminated: boolean } | null {
  const text = scanner.text;

  if (text.startsWith('$(', index) || text.charAt(index) === '`') {
    scanner.hasSubstitution = true;

    const isBacktick = text.charAt(index) === '`';
    const bodyStart = index + (isBacktick ? 1 : 2);

    const end = isBacktick
      ? findBacktickEnd(scanner, level, bodyStart)
      : collectTokens(scanner, buildNestedLevel(level.limit, ')'), bodyStart).end;

    return collectExpansionBody(scanner, level, index, bodyStart, end);
  }

  if (text.startsWith('${', index)) {
    return collectExpansionBody(
      scanner,
      level,
      index,
      -1,
      findParameterEnd(scanner, level, index + 2),
    );
  }

  return null;
}

function buildNestedLevel(limit: number, closer: ')' | null): Level {
  return { substitutions: [], limit, closer, depth: 0 };
}

function collectExpansionBody(
  scanner: Scanner,
  level: Level,
  index: number,
  bodyStart: number,
  end: number,
): { end: number; isUnterminated: boolean } {
  if (end === -1) {
    scanner.unclosedAt ??= index;

    return { end: level.limit, isUnterminated: true };
  }

  if (bodyStart !== -1) {
    level.substitutions.push(scanner.text.slice(bodyStart, end));
  }

  return { end: end + 1, isUnterminated: false };
}

// The shell ends a backtick body at the first unescaped backtick, before it
// reads any quote.
function findBacktickEnd(scanner: Scanner, level: Level, start: number): number {
  for (let index = start; index < level.limit; index += 1) {
    if (scanner.literals.has(index)) {
      continue;
    }

    if (scanner.text.charAt(index) === '\\') {
      index += 1;
    } else if (scanner.text.charAt(index) === '`') {
      return index;
    }
  }

  return -1;
}

// Inside `${…}` a double quote opens its own quoting, so a quote there closes
// no outer quote, and a single quote and a bare `{` are plain text.
function findParameterEnd(scanner: Scanner, level: Level, start: number): number {
  const text = scanner.text;
  let isDoubleQuoted = false;
  let index = start;

  while (index < level.limit) {
    const ch = text.charAt(index);

    if (scanner.literals.has(index)) {
      index += 1;
      continue;
    }

    if (ch === '\\') {
      index += 2;
      continue;
    }

    const expansion = readExpansion(scanner, level, index);

    if (expansion !== null) {
      if (expansion.isUnterminated) {
        return -1;
      }

      index = expansion.end;
      continue;
    }

    if (ch === '"') {
      isDoubleQuoted = !isDoubleQuoted;
    } else if (!isDoubleQuoted && ch === '}') {
      return index;
    }

    index += 1;
  }

  return -1;
}

interface ScannedRedirect {
  readonly target: string | null;
  readonly raw: string;
  readonly end: number;
  readonly isUnterminated: boolean;
}

// The target is the next word. A target stops short at an unquoted parenthesis,
// so `(echo x > out)` writes `out`, while the redirection still takes the
// whole word. A process substitution runs its body as a command.
function readRedirect(
  scanner: Scanner,
  level: Level,
  start: number,
  operator: string,
): ScannedRedirect {
  const text = scanner.text;
  let index = start + operator.length;

  if (operator.endsWith('(')) {
    scanner.hasSubstitution = true;

    const expansion = collectExpansionBody(
      scanner,
      level,
      start,
      index,
      collectTokens(scanner, buildNestedLevel(level.limit, ')'), index).end,
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

  const word = readWord(scanner, level, index);

  if (word.raw === '') {
    return { target: null, raw: '', end: index, isUnterminated: false };
  }

  return {
    target: word.paren === null ? word.value : word.value.slice(0, word.paren.value),
    raw: word.paren === null ? word.raw : word.raw.slice(0, word.paren.raw),
    end: word.end,
    isUnterminated: word.isUnterminated,
  };
}

interface Heredoc {
  readonly delimiter: string;
  readonly isQuoted: boolean;
  readonly stripsTabs: boolean;
}

// Any quoted character in the word quotes the whole delimiter and turns
// substitution off for the body.
function buildHeredoc(raw: string, stripsTabs: boolean): Heredoc {
  const word = raw.replaceAll('\\\n', '');

  return {
    delimiter: word.replaceAll(/['"\\]/gu, ''),
    isQuoted: /['"\\]/u.test(word),
    stripsTabs,
  };
}

// Each body starts on the line after the one that opened it and ends at the
// line that holds only its delimiter; a body with no such line runs to the end.
// Quotes are plain text in a body, so only a backslash and a substitution count.
function readHeredocs(
  scanner: Scanner,
  level: Level,
  start: number,
  heredocs: readonly Heredoc[],
  tokens: ShellToken[],
): number {
  let bodyStart = start;
  let end = start;

  for (const heredoc of heredocs) {
    const [bodyEnd, next] = findHeredocEnd(scanner.text, bodyStart, level.limit, heredoc);

    tokens.push({
      kind: 'heredoc',
      body: scanner.text.slice(bodyStart, bodyEnd),
      isQuoted: heredoc.isQuoted,
      start: bodyStart,
      end: next,
    });

    if (!heredoc.isQuoted) {
      level.substitutions.push(...collectHeredocSubstitutions(scanner, bodyStart, bodyEnd));
    }

    end = next;
    bodyStart = Math.min(next + 1, level.limit);
  }

  return end;
}

function findHeredocEnd(
  text: string,
  bodyStart: number,
  limit: number,
  heredoc: Heredoc,
): [number, number] {
  let lineStart = bodyStart;

  while (lineStart < limit) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 || newline > limit ? limit : newline;
    const line = text.slice(lineStart, lineEnd);

    if ((heredoc.stripsTabs ? line.replace(/^\t+/u, '') : line) === heredoc.delimiter) {
      return [lineStart, lineEnd];
    }

    lineStart = lineEnd + 1;
  }

  return [limit, limit];
}

function collectHeredocSubstitutions(scanner: Scanner, start: number, end: number): string[] {
  const body = buildNestedLevel(end, null);
  let index = start;

  while (index < end) {
    if (scanner.literals.has(index)) {
      index += 1;
    } else if (scanner.text.charAt(index) === '\\') {
      index += 2;
    } else {
      index = readExpansion(scanner, body, index)?.end ?? index + 1;
    }
  }

  return body.substitutions;
}
