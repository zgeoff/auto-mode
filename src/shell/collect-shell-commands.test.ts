import { expect, test } from 'bun:test';
import { collectShellCommands } from './collect-shell-commands.ts';

test('it reads each segment with the directory it runs in and the files it writes', () => {
  expect(
    collectShellCommands('cd app && make > build.log 2>&1; cd && ls', '/w', '/home/dev'),
  ).toStrictEqual([
    { words: ['cd', 'app'], directory: '/w', writeTargets: [] },
    { words: ['make'], directory: '/w/app', writeTargets: ['build.log'] },
    { words: ['cd'], directory: '/w/app', writeTargets: [] },
    { words: ['ls'], directory: '/home/dev', writeTargets: [] },
  ]);
});

test('it leaves the directory unknown after a cd in a command with a pipe', () => {
  expect(collectShellCommands('cd app | cat; rm x', '/w', '/home/dev')).toStrictEqual([
    { words: ['cd', 'app'], directory: '/w', writeTargets: [] },
    { words: ['cat'], directory: null, writeTargets: [] },
    { words: ['rm', 'x'], directory: null, writeTargets: [] },
  ]);
});

test('it keeps the directory after a cd when the only pipe sits inside quotes', () => {
  expect(collectShellCommands('cd app && echo "a|b"', '/w', '/home/dev')).toStrictEqual([
    { words: ['cd', 'app'], directory: '/w', writeTargets: [] },
    { words: ['echo', 'a|b'], directory: '/w/app', writeTargets: [] },
  ]);
});

test('it leaves the directory unknown after a cd into a variable', () => {
  expect(collectShellCommands('cd "$TARGET" && rm x', '/w', '/home/dev')).toStrictEqual([
    { words: ['cd', '$TARGET'], directory: '/w', writeTargets: [] },
    { words: ['rm', 'x'], directory: null, writeTargets: [] },
  ]);
});

test('it reads no file written by a duplication or an input redirection', () => {
  expect(collectShellCommands('cmd >&2 < in.txt 2>&1', '/w', '/home/dev')).toStrictEqual([
    { words: ['cmd'], directory: '/w', writeTargets: [] },
  ]);
});

test.each([
  ['an appending redirection', 'echo hi >> out.txt'],
  ['a clobbering redirection', 'echo hi >| out.txt'],
  ['a numbered redirection', 'echo hi 1> out.txt'],
  ['a redirection of both streams', 'echo hi &> out.txt'],
  ['a quoted target', `echo hi > "out.txt"`],
])('it reads the file %s writes', (_label, command) => {
  expect(collectShellCommands(command, '/w', '/home/dev')).toStrictEqual([
    { words: ['echo', 'hi'], directory: '/w', writeTargets: ['out.txt'] },
  ]);
});
