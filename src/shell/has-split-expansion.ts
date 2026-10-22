import { splitShellTokens } from './split-shell-tokens.ts';

// The shell splits only what an expansion outside quotes produces. A
// substitution's body can hold quotes of its own, so the scanner's bodies drop
// out before the word's own quotes are read.
export function hasSplitExpansion(raw: string): boolean {
  const scanned = splitShellTokens(raw);

  if (scanned.isUnterminated) {
    return true;
  }

  let text = raw;
  let cursor = 0;

  for (const body of scanned.substitutions) {
    const dollar = text.indexOf(`$(${body})`, cursor);
    const backtick = text.indexOf(`\`${body}\``, cursor);
    const start = dollar === -1 || (backtick !== -1 && backtick < dollar) ? backtick : dollar;

    if (start === -1) {
      return true;
    }

    const opener = start === dollar ? '$(' : '`';

    text = `${text.slice(0, start)}${opener}${text.slice(start + opener.length + body.length)}`;
    cursor = start + opener.length;
  }

  return hasBareExpansion(text);
}

function hasBareExpansion(text: string): boolean {
  let quote: 'single' | 'ansi' | 'double' | null = null;

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    const next = text.charAt(index + 1);

    if (quote === 'single' || quote === 'ansi') {
      if (char === '\\' && quote === 'ansi') {
        index += 1;
      } else if (char === "'") {
        quote = null;
      }
    } else if (char === '\\') {
      index += 1;
    } else if (char === '"') {
      quote = quote === 'double' ? null : 'double';
    } else if (quote === null && char === "'") {
      quote = 'single';
    } else if (quote === null && char === '$' && next === "'") {
      quote = 'ansi';
      index += 1;
    } else if (quote === null && (char === '`' || (char === '$' && /[\w@*#?$!({-]/u.test(next)))) {
      return true;
    }
  }

  return false;
}
