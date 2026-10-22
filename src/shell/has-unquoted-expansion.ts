// Inside double quotes, a substitution or a braced expansion can open quotes
// of its own, which this scan cannot follow, so it counts as unquoted.
export function hasUnquotedExpansion(raw: string): boolean {
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
    } else if (char === '`' || (char === '$' && (next === '(' || next === '{'))) {
      return true;
    } else if (char === '"') {
      quote = quote === 'double' ? null : 'double';
    } else if (quote === null && char === "'") {
      quote = 'single';
    } else if (quote === null && char === '$' && next === "'") {
      quote = 'ansi';
      index += 1;
    } else if (quote === null && char === '$' && /[\w@*#?$!-]/u.test(next)) {
      return true;
    }
  }

  return false;
}
