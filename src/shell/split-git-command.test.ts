import { expect, test } from 'bun:test';
import { splitGitCommand } from './split-git-command.ts';

test('it moves the directory by each -C and keeps the value of -c', () => {
  expect(
    splitGitCommand(['-C', 'app', '-c', 'user.name=x', '-C', 'sub', 'push', 'origin'], '/w', '/h'),
  ).toStrictEqual({
    directory: '/w/app/sub',
    config: [{ source: 'value', setting: 'user.name=x' }],
    args: ['push', 'origin'],
  });
});

test('it keeps each --config-env setting in order, in either spelling', () => {
  expect(
    splitGitCommand(
      ['--config-env', 'core.hooksPath=HOOKS', '--config-env=user.name=NAME', 'commit'],
      '/w',
      '/h',
    ),
  ).toStrictEqual({
    directory: '/w',
    config: [
      { source: 'environment', setting: 'core.hooksPath=HOOKS' },
      { source: 'environment', setting: 'user.name=NAME' },
    ],
    args: ['commit'],
  });
});

test('it skips a global flag that takes no value', () => {
  expect(splitGitCommand(['--no-pager', 'log'], '/w', '/h')).toStrictEqual({
    directory: '/w',
    config: [],
    args: ['log'],
  });
});

test('it leaves the directory unknown when -C names a variable', () => {
  expect(splitGitCommand(['-C', '$DIR', 'commit'], '/w', '/h')).toStrictEqual({
    directory: null,
    config: [],
    args: ['commit'],
  });
});

test('it reads no subcommand from options alone', () => {
  expect(splitGitCommand(['-C', '/repo'], '/w', '/h')).toStrictEqual({
    directory: '/repo',
    config: [],
    args: [],
  });
});
