import { expect, test } from 'bun:test';
import { splitShellCommand } from './split-shell-command.ts';

test.each([
  ['&&', 'ls && pwd'],
  ['||', 'ls || pwd'],
  [';', 'ls ; pwd'],
  ['|', 'ls | pwd'],
  ['&', 'ls & pwd'],
  ['a newline', 'ls\npwd'],
])('it splits a chain joined by %s', (_operator, command) => {
  expect(splitShellCommand(command)).toStrictEqual({
    segments: [{ text: 'ls' }, { text: 'pwd' }],
    hasUnparsedConstruct: false,
  });
});

test('it reads a single command as one segment', () => {
  expect(splitShellCommand('git status --short')).toStrictEqual({
    segments: [{ text: 'git status --short' }],
    hasUnparsedConstruct: false,
  });
});

test('it drops the empty text an operator leaves behind', () => {
  expect(splitShellCommand('ls &&  && pwd')).toStrictEqual({
    segments: [{ text: 'ls' }, { text: 'pwd' }],
    hasUnparsedConstruct: false,
  });
});

// An operator inside quotes is an argument, not a chain.
test('it leaves an operator inside double quotes alone', () => {
  expect(splitShellCommand('echo "a && b"')).toStrictEqual({
    segments: [{ text: 'echo "a && b"' }],
    hasUnparsedConstruct: false,
  });
});

test('it leaves an operator inside single quotes alone', () => {
  expect(splitShellCommand("echo 'a | b'")).toStrictEqual({
    segments: [{ text: "echo 'a | b'" }],
    hasUnparsedConstruct: false,
  });
});

test('it reads an escaped operator as text', () => {
  expect(splitShellCommand(String.raw`echo a \&\& b`)).toStrictEqual({
    segments: [{ text: String.raw`echo a \&\& b` }],
    hasUnparsedConstruct: false,
  });
});

// Each of these can hide an effect the segment text does not show, so the
// caller declines to judge locally rather than guessing.
test.each([
  ['command substitution', 'rm -rf $(cat target.txt)'],
  ['a backtick', 'rm -rf `cat target.txt`'],
  ['process substitution', 'diff <(ls) <(ls)'],
  ['output redirection', 'echo hi > /etc/hosts'],
  ['substitution inside double quotes', 'echo "$(cat .env)"'],
  ['a backtick inside double quotes', 'echo "`cat .env`"'],
  ['an unbalanced quote', "echo 'unterminated"],
])('it reports %s as unparsed', (_label, command) => {
  expect(splitShellCommand(command)).toStrictEqual({
    segments: [{ text: command }],
    hasUnparsedConstruct: true,
  });
});

// A substitution inside single quotes does not expand, so it hides nothing.
test('it reads a substitution inside single quotes as plain text', () => {
  expect(splitShellCommand("echo '$(cat .env)'")).toStrictEqual({
    segments: [{ text: "echo '$(cat .env)'" }],
    hasUnparsedConstruct: false,
  });
});

test('it reports an empty command as no segments', () => {
  expect(splitShellCommand('   ')).toStrictEqual({ segments: [], hasUnparsedConstruct: false });
});
