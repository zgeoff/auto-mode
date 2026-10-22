// The shell expands a variable or a substitution inside double quotes too, but
// never inside single or ANSI-C quotes. 'unquoted' leaves out the double-quoted
// ones, which the shell keeps as one word.
export function hasExpansion(raw: string, reach: 'unquoted' | 'any'): boolean {
  let quote: 'single' | 'ansi' | 'double' | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw.charAt(index);
    const next = raw.charAt(index + 1);

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
    } else if (
      (quote === null || reach === 'any') &&
      (char === '`' || (char === '$' && /[\w@*#?$!({-]/u.test(next)))
    ) {
      return true;
    }
  }

  return false;
}
