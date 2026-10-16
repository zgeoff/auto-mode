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
// a backslash inside it escapes the next character, an endpoint or `]` alike.
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
    const char = pattern[index] ?? '';

    if (char === ']') {
      return { source: buildClassSource(members, negated), end: index + 1 };
    }

    if (char === '\\' && index + 1 < pattern.length) {
      members += toClassMember(pattern[index + 1] ?? '');
      index += 2;
    } else {
      members += char === '-' ? '-' : toClassMember(char);
      index += 1;
    }
  }

  return null;
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
