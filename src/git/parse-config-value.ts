const CONFIG_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['n', '\n'],
  ['t', '\t'],
  ['b', ''],
]);

// Git reads a config value with its quotes removed, its escapes resolved, and
// an unquoted `#` or `;` starting a comment.
export function parseConfigValue(raw: string): string {
  let value = '';
  let isQuoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index] ?? '';

    if (char === '\\') {
      const next = raw[index + 1] ?? '';

      value += CONFIG_ESCAPES.get(next) ?? next;
      index += 1;
    } else if (char === '"') {
      isQuoted = !isQuoted;
    } else if (!isQuoted && (char === '#' || char === ';')) {
      break;
    } else {
      value += char;
    }
  }

  return value.trim();
}
