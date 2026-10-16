// A pattern reads as GitHub's branch protection rule does, with fnmatch: `*`
// stops at a slash, `**/` spans folders, and a brace is a literal character,
// so `release/{1,2}` protects only the branch of that exact name.
export function isProtectedBranch(branch: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => buildBranchPattern(pattern).test(branch));
}

function buildBranchPattern(pattern: string): RegExp {
  let source = '';
  let index = 0;

  while (index < pattern.length) {
    const char = pattern[index] ?? '';

    if (pattern.startsWith('**/', index)) {
      source += '(?:.*/)?';
      index += 3;
    } else if (pattern.startsWith('**', index)) {
      source += '.*';
      index += 2;
    } else if (char === '*') {
      source += '[^/]*';
      index += 1;
    } else if (char === '?') {
      source += '[^/]';
      index += 1;
    } else if (char === '[') {
      const bracket = buildBracketPattern(pattern, index);

      source += bracket?.source ?? String.raw`\[`;
      index = bracket?.end ?? index + 1;
    } else if (char === '\\' && index + 1 < pattern.length) {
      source += toLiteralPattern(pattern[index + 1] ?? '');
      index += 2;
    } else {
      source += toLiteralPattern(char);
      index += 1;
    }
  }

  return new RegExp(`^${source}$`, 'u');
}

// A class never matches a slash, as fnmatch reads it under FNM_PATHNAME, and
// a backslash inside it escapes the next character, a range end or `]` alike.
function buildBracketPattern(
  pattern: string,
  start: number,
): { readonly source: string; readonly end: number } | null {
  let index = start + 1;
  const negated = pattern[index] === '!' || pattern[index] === '^';

  if (negated) {
    index += 1;
  }

  let members = '';

  while (index < pattern.length) {
    if (pattern[index] === ']') {
      return { source: buildClassSource(members, negated), end: index + 1 };
    }

    const low = readClassChar(pattern, index);

    index = low.end;

    if (pattern[index] === '-' && index + 1 < pattern.length && pattern[index + 1] !== ']') {
      const high = readClassChar(pattern, index + 1);

      index = high.end;
      members += buildRangeSource(low.char, high.char);
    } else {
      members += toClassMember(low.char);
    }
  }

  return null;
}

// fnmatch reads a class member as a whole code point, where indexing a string
// would split a character outside the Basic Multilingual Plane in two.
function readClassChar(
  pattern: string,
  index: number,
): { readonly char: string; readonly end: number } {
  const start = pattern[index] === '\\' && index + 1 < pattern.length ? index + 1 : index;
  const char = String.fromCodePoint(pattern.codePointAt(start) ?? 0);

  return { char, end: start + char.length };
}

// fnmatch reads a range whose ends are out of order as one that matches
// nothing, where a RegExp would throw on it. It orders the ends by code point,
// which UTF-16 string order breaks for a character outside the BMP.
function buildRangeSource(low: string, high: string): string {
  return (low.codePointAt(0) ?? 0) <= (high.codePointAt(0) ?? 0)
    ? `${toClassMember(low)}-${toClassMember(high)}`
    : '';
}

function buildClassSource(members: string, negated: boolean): string {
  if (negated) {
    return `[^/${members}]`;
  }

  return members === '' ? '(?!)' : `(?!/)[${members}]`;
}

function toClassMember(char: string): string {
  return /[\\\][^-]/u.test(char) ? `\\${char}` : char;
}

function toLiteralPattern(char: string): string {
  return char.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}
