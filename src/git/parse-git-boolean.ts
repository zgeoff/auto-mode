const TRUE_WORDS: ReadonlySet<string> = new Set(['true', 'yes', 'on']);
const FALSE_WORDS: ReadonlySet<string> = new Set(['false', 'no', 'off', '']);

// git reads a boolean environment value without case, and a number as true
// unless it is zero. It refuses to run on any other value.
export function parseGitBoolean(value: string): boolean | null {
  const word = value.trim().toLowerCase();

  if (TRUE_WORDS.has(word)) {
    return true;
  }

  if (FALSE_WORDS.has(word)) {
    return false;
  }

  return /^[+-]?\d+$/u.test(word) ? Number(word) !== 0 : null;
}
