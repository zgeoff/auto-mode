import { hasExpansion } from './has-expansion.ts';
import type { ShellWord } from './types.ts';

// The shell splits only what an expansion outside quotes produces, and a word
// unbash could not close can end anywhere.
export function hasSplitExpansion(word: ShellWord): boolean {
  return word.hasError || hasExpansion(word, 'unquoted');
}
