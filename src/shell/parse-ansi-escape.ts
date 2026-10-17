const ANSI_ESCAPES: Readonly<Record<string, string>> = {
  a: '\u0007',
  b: '\b',
  e: '\u001B',
  E: '\u001B',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '?': '?',
};

// Inside `$'…'` bash decodes a backslash escape: a named character, `\xHH`, or
// up to three octal digits. Any other backslash stays as written.
export function parseANSIEscape(raw: string, index: number): { text: string; end: number } {
  const next = raw.charAt(index + 1);
  const named = ANSI_ESCAPES[next];
  const hex = /^x(?<digits>[0-9A-Fa-f]{1,2})/u.exec(raw.slice(index + 1));
  const octal = /^[0-7]{1,3}/u.exec(raw.slice(index + 1));

  if (named !== undefined) {
    return { text: named, end: index + 2 };
  }

  if (hex !== null) {
    return {
      text: String.fromCodePoint(Number.parseInt(hex.groups?.['digits'] ?? '', 16)),
      end: index + 1 + hex[0].length,
    };
  }

  if (octal !== null) {
    return {
      text: String.fromCodePoint(Number.parseInt(octal[0], 8)),
      end: index + 1 + octal[0].length,
    };
  }

  return { text: raw.slice(index, index + 2), end: index + 2 };
}
