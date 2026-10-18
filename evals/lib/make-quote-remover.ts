import { derivePlaceholder } from './derive-placeholder.ts';
import type { Rewriter } from './make-string-rewriter.ts';

// A run shorter than five words matches phrases that any two English texts
// share, such as "on the main branch", and would blank ordinary prose.
const QUOTE_WORDS = 5;

export function makeQuoteRemover(messages: readonly string[], salt: string): Rewriter {
  const windows = new Set(messages.flatMap((message) => collectWindows(splitWords(message))));

  return (text) => {
    const words = splitWords(text);
    const spans: { start: number; end: number }[] = [];

    for (let index = 0; index + QUOTE_WORDS <= words.length; index += 1) {
      const window = words.slice(index, index + QUOTE_WORDS);
      const [first] = window;
      const last = window.at(-1);

      if (first === undefined || last === undefined || !windows.has(toWindowKey(window))) {
        continue;
      }

      const open = spans.at(-1);

      if (open !== undefined && first.start <= open.end) {
        open.end = last.end;
      } else {
        spans.push({ start: first.start, end: last.end });
      }
    }

    return spans.reduceRight(
      (current, span) =>
        `${current.slice(0, span.start)}${derivePlaceholder('message', text.slice(span.start, span.end), salt)}${current.slice(span.end)}`,
      text,
    );
  };
}

interface Word {
  readonly key: string;
  readonly start: number;
  readonly end: number;
}

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]*(?<core>.*?)[^\p{L}\p{N}]*$/su;

// Punctuation at either end of a word stays out of its key, so a quote inside
// quotation marks or at the end of a sentence still matches the message.
function splitWords(text: string): Word[] {
  return [...text.matchAll(/\S+/gu)].flatMap((match) => {
    const core = EDGE_PUNCTUATION.exec(match[0])?.groups?.['core'] ?? '';
    const start = match.index + match[0].indexOf(core);

    return core === '' ? [] : [{ key: core.toLowerCase(), start, end: start + core.length }];
  });
}

function collectWindows(words: readonly Word[]): string[] {
  return words
    .slice(0, Math.max(0, words.length - QUOTE_WORDS + 1))
    .map((_word, index) => toWindowKey(words.slice(index, index + QUOTE_WORDS)));
}

function toWindowKey(words: readonly Word[]): string {
  return words.map((word) => word.key).join(' ');
}
