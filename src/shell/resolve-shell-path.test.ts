import { expect, test } from 'bun:test';
import { resolveShellPath } from './resolve-shell-path.ts';

test.each([
  ['a relative path against the directory', '/w', 'src/../dist/', '/w/dist'],
  ['an absolute path as it stands', '/w', '/etc//hosts', '/etc/hosts'],
  ['a tilde as the home directory', '/w', '~/notes', '/home/dev/notes'],
  ['$HOME as the home directory', '/w', '$HOME/notes', '/home/dev/notes'],
  // oxlint-disable-next-line no-template-curly-in-string -- the shell spelling, not a template
  ['a braced $HOME as the home directory', '/w', '${HOME}', '/home/dev'],
  ['an absolute path with no known directory', null, '/tmp/x', '/tmp/x'],
  ['the root as itself', '/w', '/', '/'],
])('it resolves %s', (_label, directory, path, expected) => {
  expect(resolveShellPath(directory, path, '/home/dev')).toBe(expected);
});

test.each([
  ['a variable', '$OUT/file'],
  ['a substitution', '`pwd`/file'],
  ["another user's home", '~root/.ssh'],
  ['an empty path', ''],
])('it resolves nothing for %s', (_label, path) => {
  expect(resolveShellPath('/w', path, '/home/dev')).toBeNull();
});

test('it resolves nothing for a relative path when the directory is unknown', () => {
  expect(resolveShellPath(null, 'dist', '/home/dev')).toBeNull();
});
