import { isAbsolute, join, normalize } from 'node:path';
import { isUnresolvedWord } from './is-unresolved-word.ts';

export function resolveShellPath(
  directory: string | null,
  path: string,
  home: string,
): string | null {
  const expanded = path.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/u, home);

  if (isUnresolvedWord(expanded) || expanded.startsWith('~') || expanded === '') {
    return null;
  }

  if (directory === null && !isAbsolute(expanded)) {
    return null;
  }

  const absolute =
    isAbsolute(expanded) || directory === null ? expanded : join(directory, expanded);

  return normalize(absolute).replace(/(?<=.)\/$/u, '');
}
