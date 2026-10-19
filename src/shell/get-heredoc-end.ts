import type { Heredoc } from './types.ts';

export function getHeredocEnd(
  text: string,
  bodyStart: number,
  limit: number,
  heredoc: Heredoc,
): [number, number] {
  let lineStart = bodyStart;

  while (lineStart < limit) {
    let lineEnd = getLineEnd(text, lineStart, limit);
    let line = text.slice(lineStart, lineEnd);

    // In an unquoted body the shell joins a line that ends in a line
    // continuation to the next one before it compares the delimiter.
    while (!heredoc.isQuoted && /(?<!\\)(?:\\\\)*\\$/u.test(line) && lineEnd < limit) {
      const nextEnd = getLineEnd(text, lineEnd + 1, limit);

      line = `${line.slice(0, -1)}${text.slice(lineEnd + 1, nextEnd)}`;
      lineEnd = nextEnd;
    }

    if ((heredoc.stripsTabs ? line.replace(/^\t+/u, '') : line) === heredoc.delimiter) {
      return [lineStart, lineEnd];
    }

    lineStart = lineEnd + 1;
  }

  return [limit, limit];
}

function getLineEnd(text: string, start: number, limit: number): number {
  const newline = text.indexOf('\n', start);

  return newline === -1 || newline > limit ? limit : newline;
}
