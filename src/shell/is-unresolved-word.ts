// A word holding a variable or a substitution names nothing the command text
// alone can resolve.
export function isUnresolvedWord(word: string): boolean {
  return /[$`]/u.test(word);
}
