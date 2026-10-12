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
    };

export interface ShellTokens {
  readonly tokens: readonly ShellToken[];
  readonly hasSubstitution: boolean;
  readonly isUnterminated: boolean;
}

// The one shell scanner: it tracks quotes, splits words, and reads control and
// redirection operators. `$(…)` and backticks outside single quotes, and `<(…)`
// or `>(…)`, mark the text as holding a substitution it cannot read.
export function splitShellTokens(text: string): ShellTokens {
  const tokens: ShellToken[] = [];
  let hasSubstitution = false;
  let index = 0;

  while (index < text.length) {
    const ch = text.charAt(index);

    if (/\s/u.test(ch) && ch !== '\n') {
      index += 1;
      continue;
    }

    const separator = findOperator(SEPARATORS, text, index);

    if (separator !== undefined && !text.startsWith('&>', index)) {
      tokens.push({
        kind: 'separator',
        operator: separator,
        start: index,
        end: index + separator.length,
      });

      index += separator.length;
      continue;
    }

    const word = readWord(text, index);

    hasSubstitution ||= word.hasSubstitution;

    const operator = findOperator(REDIRECTS, text, word.end);
    const isDescriptor = operator !== undefined && /^\d+$/u.test(word.raw);

    if (word.raw !== '' && !isDescriptor) {
      if (word.isUnterminated) {
        return {
          tokens: [...tokens, buildWordToken(word, index)],
          hasSubstitution,
          isUnterminated: true,
        };
      }

      tokens.push(buildWordToken(word, index));

      index = word.end;
      continue;
    }

    if (operator === undefined) {
      index += 1;
      continue;
    }

    const redirect = readRedirect(text, word.end, operator);

    hasSubstitution ||= redirect.hasSubstitution;

    tokens.push({
      kind: 'redirect',
      operator: `${word.raw}${operator}`,
      target: redirect.target,
      start: index,
      end: redirect.end,
    });

    if (redirect.isUnterminated) {
      return { tokens, hasSubstitution, isUnterminated: true };
    }

    index = redirect.end;
  }

  return { tokens, hasSubstitution, isUnterminated: false };
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

interface ScannedWord {
  readonly value: string;
  readonly raw: string;
  readonly end: number;
  readonly parenAt: number | null;
  readonly hasSubstitution: boolean;
  readonly isUnterminated: boolean;
}

function buildWordToken(word: Readonly<ScannedWord>, start: number): ShellToken {
  return { kind: 'word', value: word.value, raw: word.raw, start, end: word.end };
}

// A word ends at whitespace or at an operator outside quotes. A double-quoted
// string still expands `$(…)` and backticks, so a substitution inside one is
// as unreadable as a bare one.
function readWord(text: string, start: number): ScannedWord {
  let value = '';
  let quote: "'" | '"' | null = null;
  let hasSubstitution = false;
  let parenAt: number | null = null;
  let index = start;

  while (index < text.length) {
    const ch = text.charAt(index);

    if (quote !== null) {
      if (quote === '"' && (text.startsWith('$(', index) || ch === '`')) {
        hasSubstitution = true;
      }

      if (ch === quote) {
        quote = null;
      } else {
        value += ch;
      }

      index += 1;
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      index += 1;
      continue;
    }

    if (ch === '\\') {
      value += text.slice(index, index + 2);
      index += 2;
      continue;
    }

    if (/\s/u.test(ch) || /[;&|<>]/u.test(ch)) {
      break;
    }

    if (text.startsWith('$(', index) || ch === '`') {
      hasSubstitution = true;
    }

    if ((ch === '(' || ch === ')') && parenAt === null) {
      parenAt = value.length;
    }

    value += ch;
    index += 1;
  }

  return {
    value,
    raw: text.slice(start, Math.min(index, text.length)),
    end: Math.min(index, text.length),
    parenAt,
    hasSubstitution,
    isUnterminated: quote !== null,
  };
}

interface ScannedRedirect {
  readonly target: string | null;
  readonly end: number;
  readonly hasSubstitution: boolean;
  readonly isUnterminated: boolean;
}

// The target is the next word. A target stops short at an unquoted parenthesis,
// so `(echo x > out)` writes `out`, while the redirection still takes the
// whole word.
function readRedirect(text: string, start: number, operator: string): ScannedRedirect {
  let index = start + operator.length;

  while (index < text.length && /\s/u.test(text.charAt(index)) && text.charAt(index) !== '\n') {
    index += 1;
  }

  const word = readWord(text, index);
  const isProcess = operator.endsWith('(');

  if (word.raw === '') {
    return { target: null, end: index, hasSubstitution: isProcess, isUnterminated: false };
  }

  return {
    target: word.parenAt === null ? word.value : word.value.slice(0, word.parenAt),
    end: word.end,
    hasSubstitution: isProcess || word.hasSubstitution,
    isUnterminated: word.isUnterminated,
  };
}
