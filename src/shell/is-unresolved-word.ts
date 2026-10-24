export function isUnresolvedWord(word: string): boolean {
  return /[$`]/u.test(word);
}
