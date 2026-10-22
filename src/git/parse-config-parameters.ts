export interface ConfigParameter {
  readonly key: string;
  readonly value: string | null;
}

// git reads GIT_CONFIG_PARAMETERS as single-quoted words split by whitespace,
// each `'key'='value'` or `'key=value'`, and a key alone sets no value. It
// refuses the whole variable when one word breaks that form.
export function parseConfigParameters(text: string): readonly ConfigParameter[] | null {
  const parameters: ConfigParameter[] = [];
  let rest = text;

  while (rest !== '') {
    const key = parseQuotedWord(rest);

    if (key === null) {
      return null;
    }

    rest = key.rest;

    if (rest.startsWith("='")) {
      const value = parseQuotedWord(rest.slice(1));

      if (value === null) {
        return null;
      }

      parameters.push({ key: key.text, value: value.text });

      rest = value.rest;
    } else if (rest.startsWith('=')) {
      parameters.push({ key: key.text, value: null });

      rest = rest.slice(1);
    } else {
      const separator = key.text.indexOf('=');

      const parameter =
        separator === -1
          ? { key: key.text, value: null }
          : { key: key.text.slice(0, separator), value: key.text.slice(separator + 1) };

      parameters.push(parameter);
    }

    if (rest !== '' && !/^\s/u.test(rest)) {
      return null;
    }

    rest = rest.trimStart();
  }

  return parameters;
}

interface QuotedWord {
  readonly text: string;
  readonly rest: string;
}

// git's shell quoting closes a quote, escapes one `'` or `!`, and opens it
// again, as in `'it'\''s'`.
function parseQuotedWord(text: string): QuotedWord | null {
  if (!text.startsWith("'")) {
    return null;
  }

  let word = '';
  let index = 1;

  for (;;) {
    const close = text.indexOf("'", index);

    if (close === -1) {
      return null;
    }

    word += text.slice(index, close);

    const escape = /^\\(?<char>['!])'/u.exec(text.slice(close + 1))?.groups?.['char'];

    if (escape === undefined) {
      return { text: word, rest: text.slice(close + 1) };
    }

    word += escape;
    index = close + 4;
  }
}
