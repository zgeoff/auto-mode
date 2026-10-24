// A variable's name holds its section and key in lower case, and its
// subsection as written: `remote.Origin.url`. A key with no `=` has no value.
export interface ConfigVariable {
  readonly name: string;
  readonly value: string | null;
}

const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff);

interface Cursor {
  readonly text: string;
  index: number;
  isAtEnd: boolean;
}

// The grammar follows git's config.c: one pass over the characters, with a
// section header, a key and a value each read as git reads them. git refuses
// a whole file that breaks the grammar.
export function parseGitConfig(text: string): readonly ConfigVariable[] | null {
  const cursor: Cursor = {
    text: text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text,
    index: 0,
    isAtEnd: false,
  };

  const variables: ConfigVariable[] = [];
  let section = '';
  let isComment = false;

  for (;;) {
    const char = takeChar(cursor);

    if (char === '\n') {
      if (cursor.isAtEnd) {
        return variables;
      }

      isComment = false;
    } else if (isComment || isSpace(char)) {
      // git skips a comment to the line's end, and whitespace between items.
    } else if (char === '#' || char === ';') {
      isComment = true;
    } else if (char === '[') {
      const header = parseSectionHeader(cursor);

      if (header === null) {
        return null;
      }

      section = header;
    } else if (/^[a-z]$/iu.test(char)) {
      const variable = parseVariable(char, section, cursor);

      if (variable === null) {
        return null;
      }

      variables.push(variable);
    } else {
      return null;
    }
  }
}

// git reads a CR before an LF as part of the line end, and reads past the
// text's end as one more line end.
function takeChar(cursor: Cursor): string {
  if (cursor.index >= cursor.text.length) {
    cursor.isAtEnd = true;

    return '\n';
  }

  const char = cursor.text.charAt(cursor.index);

  if (char === '\r' && cursor.text.charAt(cursor.index + 1) === '\n') {
    cursor.index += 2;

    return '\n';
  }

  cursor.index += 1;

  return char;
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

// `[section]`, the older `[section.subsection]` that git lowercases whole, or
// `[section "subsection"]`, where a backslash keeps the next character.
function parseSectionHeader(cursor: Cursor): string | null {
  let name = '';

  for (;;) {
    const char = takeChar(cursor);

    if (cursor.isAtEnd) {
      return null;
    }

    if (char === ']') {
      return name === '' ? null : name;
    }

    if (isSpace(char)) {
      return parseSubsection(char, name, cursor);
    }

    if (!isKeyChar(char) && char !== '.') {
      return null;
    }

    name += char.toLowerCase();
  }
}

function parseSubsection(first: string, name: string, cursor: Cursor): string | null {
  let char = first;

  while (isSpace(char)) {
    if (char === '\n') {
      return null;
    }

    char = takeChar(cursor);
  }

  if (char !== '"') {
    return null;
  }

  let subsection = '';

  for (;;) {
    let next = takeChar(cursor);

    if (next === '\n') {
      return null;
    }

    if (next === '"') {
      break;
    }

    if (next === '\\') {
      next = takeChar(cursor);

      if (next === '\n') {
        return null;
      }
    }

    subsection += next;
  }

  return takeChar(cursor) === ']' ? `${name}.${subsection}` : null;
}

function isKeyChar(char: string): boolean {
  return /^[\da-z-]$/iu.test(char);
}

function parseVariable(first: string, section: string, cursor: Cursor): ConfigVariable | null {
  let key = first.toLowerCase();
  let char = takeChar(cursor);

  while (!cursor.isAtEnd && isKeyChar(char)) {
    key += char.toLowerCase();
    char = takeChar(cursor);
  }

  while (char === ' ' || char === '\t') {
    char = takeChar(cursor);
  }

  const name = section === '' ? key : `${section}.${key}`;

  if (char === '\n') {
    return { name, value: null };
  }

  if (char !== '=') {
    return null;
  }

  const value = parseValue(cursor);

  return value === null ? null : { name, value };
}

const VALUE_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['n', '\n'],
  ['t', '\t'],
  ['b', '\b'],
  ['\\', '\\'],
  ['"', '"'],
]);

// git drops whitespace before the value and after it outside quotes, keeps it
// inside, ends the value at an unquoted `#` or `;`, joins a line that ends in
// a backslash with the next, and refuses an unknown escape or an open quote.
function parseValue(cursor: Cursor): string | null {
  let value = '';
  let isQuoted = false;
  let isComment = false;
  let trimLength = 0;

  for (;;) {
    const char = takeChar(cursor);

    if (char === '\n') {
      if (isQuoted) {
        return null;
      }

      return trimLength > 0 ? value.slice(0, trimLength) : value;
    }

    if (isComment) {
      continue;
    }

    if (isSpace(char) && !isQuoted) {
      trimLength = trimLength > 0 ? trimLength : value.length;
      value += value === '' ? '' : char;
      continue;
    }

    if (!isQuoted && (char === '#' || char === ';')) {
      isComment = true;
      continue;
    }

    trimLength = 0;

    if (char === '\\') {
      const next = takeChar(cursor);
      const escaped = VALUE_ESCAPES.get(next);

      if (next !== '\n' && escaped === undefined) {
        return null;
      }

      value += escaped ?? '';
    } else if (char === '"') {
      isQuoted = !isQuoted;
    } else {
      value += char;
    }
  }
}
