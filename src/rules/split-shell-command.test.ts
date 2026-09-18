import { expect, test } from 'bun:test';
import { splitShellCommand } from './split-shell-command.ts';

const CHAINS: [string, string][] = [
  ['&&', 'ls && pwd'],
  ['||', 'ls || pwd'],
  [';', 'ls ; pwd'],
  ['|', 'ls | pwd'],
  ['&', 'ls & pwd'],
  ['a newline', 'ls\npwd'],
];

test.each(CHAINS)('it splits a chain joined by %s', (_operator, command) => {
  expect(splitShellCommand(command).segments.map((segment) => segment.text)).toStrictEqual([
    'ls',
    'pwd',
  ]);
});

test('it reads a single command as one segment', () => {
  expect(
    splitShellCommand('git status --short').segments.map((segment) => segment.text),
  ).toStrictEqual(['git status --short']);
});

test('it drops the empty text an operator leaves behind', () => {
  expect(splitShellCommand('ls &&  && pwd').segments.map((segment) => segment.text)).toStrictEqual([
    'ls',
    'pwd',
  ]);
});

// An operator inside quotes is an argument, not a chain.
test('it leaves an operator inside quotes alone', () => {
  expect(splitShellCommand('echo "a && b"').segments.map((segment) => segment.text)).toStrictEqual([
    'echo "a && b"',
  ]);

  expect(splitShellCommand("echo 'a | b'").segments.map((segment) => segment.text)).toStrictEqual([
    "echo 'a | b'",
  ]);
});

test('it reads an escaped operator as text', () => {
  expect(splitShellCommand(String.raw`echo a \&\& b`).segments).toHaveLength(1);
});

// Each of these can hide an effect the segment text does not show, so the
// caller declines to judge locally rather than guessing.
const OPAQUE: [string, string][] = [
  ['command substitution', 'rm -rf $(cat target.txt)'],
  ['a backtick', 'rm -rf `cat target.txt`'],
  ['process substitution', 'diff <(ls) <(ls)'],
  ['output redirection', 'echo hi > /etc/hosts'],
  ['substitution inside double quotes', 'echo "$(cat .env)"'],
  ['a backtick inside double quotes', 'echo "`cat .env`"'],
  ['an unbalanced quote', "echo 'unterminated"],
];

test.each(OPAQUE)('it reports %s as unparsed', (_label, command) => {
  expect(splitShellCommand(command).hasUnparsedConstruct).toBe(true);
});

test('it reports a plain chain as fully parsed', () => {
  expect(splitShellCommand('ls && pwd').hasUnparsedConstruct).toBe(false);
});

// A substitution inside single quotes does not expand, so it hides nothing.
test('it reads a substitution inside single quotes as plain text', () => {
  expect(splitShellCommand("echo '$(cat .env)'").hasUnparsedConstruct).toBe(false);
});

test('it reports an empty command as no segments', () => {
  expect(splitShellCommand('   ').segments).toBeEmpty();
});
