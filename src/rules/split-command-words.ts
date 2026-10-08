// Splits one shell segment into words with their quotes removed, then drops
// leading environment assignments and wrappers (env, sudo, timeout) and every
// redirection, so the first word is the program and the rest its arguments.
export function splitCommandWords(text: string): readonly string[] {
  const words = splitWords(text);
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

  return words
    .slice(index)
    .filter(
      (word, position, all) =>
        !/^\d*[<>]/u.test(word) && !/^\d*>{1,2}\|?$/u.test(all[position - 1] ?? ''),
    );
}

function splitWords(text: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: string | null = null;
  let started = false;

  for (const ch of text) {
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
    } else if (/\s/u.test(ch)) {
      if (started) {
        words.push(current);
      }

      current = '';
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }

  if (started) {
    words.push(current);
  }

  return words;
}
