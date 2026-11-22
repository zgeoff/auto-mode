import { expect, test } from 'bun:test';
import { parseShellCommand } from './parse-shell-command.ts';
import { splitCommandWords } from './split-command-words.ts';

test('it splits a segment into its program and arguments', () => {
  expect(
    splitCommandWords(
      parseShellCommand('git  push origin\tmain').segments.flatMap((segment) => segment.words),
    ),
  ).toStrictEqual(['git', 'push', 'origin', 'main']);
});

test('it removes quotes and keeps the whitespace they hold', () => {
  expect(
    splitCommandWords(
      parseShellCommand(`echo "a b" 'c d'`).segments.flatMap((segment) => segment.words),
    ),
  ).toStrictEqual(['echo', 'a b', 'c d']);
});

test('it joins quoted parts that touch into one word', () => {
  expect(
    splitCommandWords(
      parseShellCommand(`echo 'it''s' "x"y`).segments.flatMap((segment) => segment.words),
    ),
  ).toStrictEqual(['echo', 'its', 'xy']);
});

test('it keeps an empty quoted argument as an empty word', () => {
  expect(
    splitCommandWords(
      parseShellCommand('git commit -m ""').segments.flatMap((segment) => segment.words),
    ),
  ).toStrictEqual(['git', 'commit', '-m', '']);
});

test('it reads no words in an empty segment', () => {
  expect(
    splitCommandWords(parseShellCommand('  ').segments.flatMap((segment) => segment.words)),
  ).toStrictEqual([]);
});

test.each([
  ['environment assignments', 'FOO=1 BAR=2 rm -rf dist', ['rm', '-rf', 'dist']],
  ['sudo wrapper', 'sudo rm -rf dist', ['rm', '-rf', 'dist']],
  ['command wrapper', 'command rm -rf dist', ['rm', '-rf', 'dist']],
  ['env wrapper with its unset options and assignments', 'env -u HOME FOO=1 rm x', ['rm', 'x']],
  ['timeout wrapper and its duration', 'timeout 5 git push', ['git', 'push']],
  ['stacked wrappers', 'sudo FOO=1 timeout 5s rm x', ['rm', 'x']],
])('it drops the leading %s', (_label, text, expected) => {
  expect(
    splitCommandWords(parseShellCommand(text).segments.flatMap((segment) => segment.words)),
  ).toStrictEqual(expected);
});

test('it reads no words in a segment that only assigns variables', () => {
  expect(
    splitCommandWords(
      parseShellCommand('FOO=1 BAR=2').segments.flatMap((segment) => segment.words),
    ),
  ).toStrictEqual([]);
});

test.each([
  ['an output redirection and its target', 'echo hi > out.txt', ['echo', 'hi']],
  ['an appending redirection and its target', 'echo hi >> out.txt', ['echo', 'hi']],
  ['a clobbering redirection and its target', 'echo hi >| out.txt', ['echo', 'hi']],
  ['a numbered redirection and its target', 'ls 2> /dev/null', ['ls']],
  ['a redirection attached to its target', 'cat <in.txt 2>>err.log file', ['cat', 'file']],
  ['a descriptor duplication', 'make 2>&1', ['make']],
])('it drops %s', (_label, text, expected) => {
  expect(
    splitCommandWords(parseShellCommand(text).segments.flatMap((segment) => segment.words)),
  ).toStrictEqual(expected);
});
