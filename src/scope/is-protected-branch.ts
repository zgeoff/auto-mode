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
      const close = pattern.indexOf(']', index + 2);

      if (close === -1) {
        source += String.raw`\[`;
        index += 1;
      } else {
        const body = pattern.slice(index + 1, close);
        const negated = body.startsWith('!') || body.startsWith('^');
        const members = (negated ? body.slice(1) : body).replaceAll(/[\\\]^]/gu, String.raw`\$&`);

        source += `[${negated ? '^' : ''}${members}]`;
        index = close + 1;
      }
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

function toLiteralPattern(char: string): string {
  return char.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}
