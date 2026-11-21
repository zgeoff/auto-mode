import { expect, test } from 'bun:test';
import { collectShellCommands } from './collect-shell-commands.ts';
import { parseShellCommand } from './parse-shell-command.ts';

test('it reads each segment with the directory it runs in and the files it writes', () => {
  expect(
    collectShellCommands(
      parseShellCommand('cd app && make > build.log 2>&1; cd && ls'),
      '/w',
      '/home/dev',
    ),
  ).toStrictEqual([
    { words: ['cd', 'app'], directory: '/w', directories: ['/w'], writeTargets: [] },
    { words: ['make'], directory: '/w/app', directories: ['/w/app'], writeTargets: ['build.log'] },
    { words: ['cd'], directory: '/w/app', directories: ['/w/app'], writeTargets: [] },
    { words: ['ls'], directory: '/home/dev', directories: ['/home/dev'], writeTargets: [] },
  ]);
});

test('it leaves the directory unknown after a cd in a command with a pipe', () => {
  expect(
    collectShellCommands(parseShellCommand('cd app | cat; rm x'), '/w', '/home/dev'),
  ).toStrictEqual([
    { words: ['cd', 'app'], directory: '/w', directories: ['/w'], writeTargets: [] },
    { words: ['cat'], directory: null, directories: [null], writeTargets: [] },
    { words: ['rm', 'x'], directory: null, directories: [null], writeTargets: [] },
  ]);
});

test('it keeps the directory after a cd when the only pipe sits inside quotes', () => {
  expect(
    collectShellCommands(parseShellCommand('cd app && echo "a|b"'), '/w', '/home/dev'),
  ).toStrictEqual([
    { words: ['cd', 'app'], directory: '/w', directories: ['/w'], writeTargets: [] },
    { words: ['echo', 'a|b'], directory: '/w/app', directories: ['/w/app'], writeTargets: [] },
  ]);
});

test('it leaves the directory unknown after a cd into a variable', () => {
  expect(
    collectShellCommands(parseShellCommand('cd "$TARGET" && rm x'), '/w', '/home/dev'),
  ).toStrictEqual([
    { words: ['cd', '$TARGET'], directory: '/w', directories: ['/w'], writeTargets: [] },
    { words: ['rm', 'x'], directory: null, directories: [null], writeTargets: [] },
  ]);
});

test('it reads no file written by a duplication or an input redirection', () => {
  expect(
    collectShellCommands(parseShellCommand('cmd >&2 < in.txt 2>&1'), '/w', '/home/dev'),
  ).toStrictEqual([{ words: ['cmd'], directory: '/w', directories: ['/w'], writeTargets: [] }]);
});

test.each([
  ['an appending redirection', 'echo hi >> out.txt'],
  ['a clobbering redirection', 'echo hi >| out.txt'],
  ['a numbered redirection', 'echo hi 1> out.txt'],
  ['a redirection of both streams', 'echo hi &> out.txt'],
  ['a quoted target', `echo hi > "out.txt"`],
])('it reads the file %s writes', (_label, command) => {
  expect(collectShellCommands(parseShellCommand(command), '/w', '/home/dev')).toStrictEqual([
    { words: ['echo', 'hi'], directory: '/w', directories: ['/w'], writeTargets: ['out.txt'] },
  ]);
});

test('it reads every directory a compound body that may not run can leave', () => {
  expect(
    collectShellCommands(
      parseShellCommand('if test -d app; then cd app; fi; rm x'),
      '/w',
      '/home/dev',
    ).at(-1),
  ).toStrictEqual({
    words: ['rm', 'x'],
    directory: null,
    directories: ['/w', '/w/app'],
    writeTargets: [],
  });
});
