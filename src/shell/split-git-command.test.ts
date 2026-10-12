import { expect, test } from 'bun:test';
import { splitGitCommand } from './split-git-command.ts';

test('it moves the directory by each -C and skips the value of -c', () => {
  expect(
    splitGitCommand(['-C', 'app', '-c', 'user.name=x', '-C', 'sub', 'push', 'origin'], '/w', '/h'),
  ).toStrictEqual({ directory: '/w/app/sub', args: ['push', 'origin'] });
});

test('it skips a global flag that takes no value', () => {
  expect(splitGitCommand(['--no-pager', 'log'], '/w', '/h')).toStrictEqual({
    directory: '/w',
    args: ['log'],
  });
});

test('it leaves the directory unknown when -C names a variable', () => {
  expect(splitGitCommand(['-C', '$DIR', 'commit'], '/w', '/h')).toStrictEqual({
    directory: null,
    args: ['commit'],
  });
});

test('it reads no subcommand from options alone', () => {
  expect(splitGitCommand(['-C', '/repo'], '/w', '/h')).toStrictEqual({
    directory: '/repo',
    args: [],
  });
});
