import { splitShellTokens } from './split-shell-tokens.ts';
import { toWordValues } from './to-word-values.ts';

export function splitCommandWords(text: string): readonly string[] {
  const words = splitShellTokens(text).tokens.flatMap((token) => toWordValues(token));
  let index = 0;

  while (index < words.length) {
    const word = words[index] ?? '';

    if (/^\w+=/u.test(word) || word === 'sudo' || word === 'command') {
      index += 1;
    } else if (word === 'env') {
      index += 1;

      while (words[index] === '-u' || /^\w+=/u.test(words[index] ?? '')) {
        index += words[index] === '-u' ? 2 : 1;
      }
    } else if (word === 'timeout') {
      index += 2;
    } else {
      break;
    }
  }

  return words.slice(index);
}
