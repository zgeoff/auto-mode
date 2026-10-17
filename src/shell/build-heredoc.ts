import { parseANSIEscape } from './parse-ansi-escape.ts';
import type { Heredoc } from './types.ts';

// Any quote or escape in the word turns substitution off for the body. The
// delimiter is the word after quote removal, so a single-quoted backslash
// stays and a line continuation outside single quotes joins the word.
export function buildHeredoc(raw: string, stripsTabs: boolean, opener: number): Heredoc {
  let delimiter = '';
  let quote: "'" | '"' | "$'" | null = null;
  let isQuoted = false;
  let index = 0;

  while (index < raw.length) {
    const ch = raw.charAt(index);
    const next = raw.charAt(index + 1);

    if (quote === "$'" && ch === '\\') {
      const escape = parseANSIEscape(raw, index);

      delimiter += escape.text;
      index = escape.end;
    } else if (quote === "$'" && ch === "'") {
      quote = null;
      index += 1;
    } else if (quote === "$'") {
      delimiter += ch;
      index += 1;
    } else if (quote === null && ch === '$' && (next === "'" || next === '"')) {
      quote = next === "'" ? "$'" : '"';
      isQuoted = true;
      index += 2;
    } else if (quote === "'") {
      quote = ch === "'" ? null : quote;
      delimiter += ch === "'" ? '' : ch;
      index += 1;
    } else if (ch === quote) {
      quote = null;
      index += 1;
    } else if (ch === '\\' && (quote === null || /[$`"\\\n]/u.test(next))) {
      isQuoted ||= next !== '\n';
      delimiter += next === '\n' ? '' : next;
      index += 2;
    } else if (quote === null && (ch === "'" || ch === '"')) {
      quote = ch;
      isQuoted = true;
      index += 1;
    } else {
      delimiter += ch;
      index += 1;
    }
  }

  return { delimiter, isQuoted, stripsTabs, opener };
}
