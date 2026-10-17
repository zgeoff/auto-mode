import { expect, test } from 'bun:test';
import { splitShellCommand } from './split-shell-command.ts';

test.each([
  ['&&', 'ls && pwd', 6, 9],
  ['||', 'ls || pwd', 6, 9],
  [';', 'ls ; pwd', 5, 8],
  ['|', 'ls | pwd', 5, 8],
  ['&', 'ls & pwd', 5, 8],
  ['a newline', 'ls\npwd', 3, 6],
])('it splits a chain joined by %s', (_operator, command, start, end) => {
  expect(splitShellCommand(command)).toStrictEqual({
    segments: [
      { text: 'ls', start: 0, end: 2 },
      { text: 'pwd', start, end },
    ],
    hasUnparsedConstruct: false,
  });
});

interface LeftOutCase {
  readonly label: string;
  readonly command: string;
  readonly first: string;
  readonly firstEnd: number;
  readonly start: number;
  readonly end: number;
}

test.each<LeftOutCase>([
  {
    label: 'a comment',
    command: 'ls # list it\npwd',
    first: 'ls',
    firstEnd: 2,
    start: 13,
    end: 16,
  },
  {
    label: 'a heredoc body',
    command: 'cat <<EOF\nrm -rf x\nEOF\npwd',
    first: 'cat <<EOF',
    firstEnd: 9,
    start: 23,
    end: 26,
  },
])('it leaves $label out of every segment', (row) => {
  expect(splitShellCommand(row.command).segments).toStrictEqual([
    { text: row.first, start: 0, end: row.firstEnd },
    { text: 'pwd', start: row.start, end: row.end },
  ]);
});

test('it reads a single command as one segment', () => {
  expect(splitShellCommand('git status --short')).toStrictEqual({
    segments: [{ text: 'git status --short', start: 0, end: 18 }],
    hasUnparsedConstruct: false,
  });
});

test('it drops the empty text an operator leaves behind', () => {
  expect(splitShellCommand('ls &&  && pwd')).toStrictEqual({
    segments: [
      { text: 'ls', start: 0, end: 2 },
      { text: 'pwd', start: 10, end: 13 },
    ],
    hasUnparsedConstruct: false,
  });
});

// An operator inside quotes is an argument, not a chain.
test('it leaves an operator inside double quotes alone', () => {
  expect(splitShellCommand('echo "a && b"')).toStrictEqual({
    segments: [{ text: 'echo "a && b"', start: 0, end: 13 }],
    hasUnparsedConstruct: false,
  });
});

test('it leaves an operator inside single quotes alone', () => {
  expect(splitShellCommand("echo 'a | b'")).toStrictEqual({
    segments: [{ text: "echo 'a | b'", start: 0, end: 12 }],
    hasUnparsedConstruct: false,
  });
});

test('it reads an escaped operator as text', () => {
  expect(splitShellCommand(String.raw`echo a \&\& b`)).toStrictEqual({
    segments: [{ text: String.raw`echo a \&\& b`, start: 0, end: 13 }],
    hasUnparsedConstruct: false,
  });
});

// Each of these can hide an effect the segment text does not show, so the
// caller declines to judge locally rather than guessing.
test.each([
  ['command substitution', 'rm -rf $(cat target.txt)', 24],
  ['a backtick', 'rm -rf `cat target.txt`', 23],
  ['process substitution', 'diff <(ls) <(ls)', 16],
  ['output redirection', 'echo hi > /etc/hosts', 20],
  ['substitution inside double quotes', 'echo "$(cat .env)"', 18],
  ['a backtick inside double quotes', 'echo "`cat .env`"', 17],
  ['an unbalanced quote', "echo 'unterminated", 18],
])('it reports %s as unparsed', (_label, command, end) => {
  expect(splitShellCommand(command)).toStrictEqual({
    segments: [{ text: command, start: 0, end }],
    hasUnparsedConstruct: true,
  });
});

// A substitution inside single quotes does not expand, so it hides nothing.
test('it reads a substitution inside single quotes as plain text', () => {
  expect(splitShellCommand("echo '$(cat .env)'")).toStrictEqual({
    segments: [{ text: "echo '$(cat .env)'", start: 0, end: 18 }],
    hasUnparsedConstruct: false,
  });
});

test('it reports an empty command as no segments', () => {
  expect(splitShellCommand('   ')).toStrictEqual({ segments: [], hasUnparsedConstruct: false });
});
