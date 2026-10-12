import { expect, test } from 'bun:test';
import { splitShellTokens } from './split-shell-tokens.ts';

test('it reads words, separators and redirections with their offsets', () => {
  expect(splitShellTokens(`cd 'my dir' && echo "a b" 2> err.log | wc -l`)).toStrictEqual({
    tokens: [
      { kind: 'word', value: 'cd', raw: 'cd', start: 0, end: 2 },
      { kind: 'word', value: 'my dir', raw: "'my dir'", start: 3, end: 11 },
      { kind: 'separator', operator: '&&', start: 12, end: 14 },
      { kind: 'word', value: 'echo', raw: 'echo', start: 15, end: 19 },
      { kind: 'word', value: 'a b', raw: '"a b"', start: 20, end: 25 },
      { kind: 'redirect', operator: '2>', target: 'err.log', start: 26, end: 36 },
      { kind: 'separator', operator: '|', start: 37, end: 38 },
      { kind: 'word', value: 'wc', raw: 'wc', start: 39, end: 41 },
      { kind: 'word', value: '-l', raw: '-l', start: 42, end: 44 },
    ],
    hasSubstitution: false,
    isUnterminated: false,
  });
});

test('it gives the same tokens for the same text', () => {
  expect(splitShellTokens('a >> b; c <in')).toStrictEqual(splitShellTokens('a >> b; c <in'));
});

test.each([
  ['an appending redirection', 'echo hi >>out', '>>', 'out'],
  ['a clobbering redirection', 'echo hi >| out', '>|', 'out'],
  ['a redirection of both streams', 'make &> build.log', '&>', 'build.log'],
  ['a descriptor duplication', 'make 2>&1', '2>&', '1'],
  ['an input redirection', 'cat < in.txt', '<', 'in.txt'],
  ['a heredoc', 'cat <<EOF', '<<', 'EOF'],
])('it reads %s as one redirection with its target', (_label, text, operator, target) => {
  expect(splitShellTokens(text).tokens.at(-1)).toMatchObject({
    kind: 'redirect',
    operator,
    target,
  });
});

test('it reads a redirection that touches the word before it apart from that word', () => {
  expect(splitShellTokens('a>b').tokens).toStrictEqual([
    { kind: 'word', value: 'a', raw: 'a', start: 0, end: 1 },
    { kind: 'redirect', operator: '>', target: 'b', start: 1, end: 3 },
  ]);
});

test('it keeps a quoted number before a redirection as a word', () => {
  expect(splitShellTokens('echo "2">x').tokens).toStrictEqual([
    { kind: 'word', value: 'echo', raw: 'echo', start: 0, end: 4 },
    { kind: 'word', value: '2', raw: '"2"', start: 5, end: 8 },
    { kind: 'redirect', operator: '>', target: 'x', start: 8, end: 10 },
  ]);
});

test('it ends a redirection target at a parenthesis', () => {
  expect(splitShellTokens('(echo x > out)').tokens.at(-1)).toStrictEqual({
    kind: 'redirect',
    operator: '>',
    target: 'out',
    start: 8,
    end: 14,
  });
});

test('it reads a redirection with nothing after it as one without a target', () => {
  expect(splitShellTokens('echo >').tokens.at(-1)).toStrictEqual({
    kind: 'redirect',
    operator: '>',
    target: null,
    start: 5,
    end: 6,
  });
});

test('it keeps an escaped operator inside the word, backslash included', () => {
  expect(splitShellTokens(String.raw`a\;b`).tokens).toStrictEqual([
    { kind: 'word', value: String.raw`a\;b`, raw: String.raw`a\;b`, start: 0, end: 4 },
  ]);
});

test('it reads a newline as a separator', () => {
  expect(splitShellTokens('a\nb').tokens).toStrictEqual([
    { kind: 'word', value: 'a', raw: 'a', start: 0, end: 1 },
    { kind: 'separator', operator: '\n', start: 1, end: 2 },
    { kind: 'word', value: 'b', raw: 'b', start: 2, end: 3 },
  ]);
});

test.each([
  ['a command substitution', 'rm $(cat list)'],
  ['a backtick', 'rm `cat list`'],
  ['a substitution inside double quotes', 'echo "$(cat .env)"'],
  ['a process substitution', 'diff <(ls) b'],
  ['an output process substitution', 'tee >(wc -l)'],
  ['a substitution in a redirection target', 'echo > $(name)'],
])('it reports %s', (_label, text) => {
  expect(splitShellTokens(text).hasSubstitution).toBeTrue();
});

test('it reads a substitution inside single quotes as plain text', () => {
  expect(splitShellTokens("echo '$(cat .env)'").hasSubstitution).toBeFalse();
});

test('it reports an unterminated quote and keeps the open word', () => {
  expect(splitShellTokens("echo 'open")).toStrictEqual({
    tokens: [
      { kind: 'word', value: 'echo', raw: 'echo', start: 0, end: 4 },
      { kind: 'word', value: 'open', raw: "'open", start: 5, end: 10 },
    ],
    hasSubstitution: false,
    isUnterminated: true,
  });
});

test('it reports an unterminated quote in a redirection target', () => {
  expect(splitShellTokens("echo > 'out").isUnterminated).toBeTrue();
});
