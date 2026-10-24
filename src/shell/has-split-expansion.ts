import { hasExpansion } from './has-expansion.ts';
import { splitShellTokens } from './split-shell-tokens.ts';

// The shell splits only what an expansion outside quotes produces, and a
// substitution's body can hold quotes of its own.
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

  return hasExpansion(text, 'unquoted');
}
