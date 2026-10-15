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
    substitutions: [],
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
    substitutions: [],
    hasSubstitution: false,
    isUnterminated: true,
  });
});

test.each([
  ['a bare substitution', 'echo $(git log)', ['git log']],
  ['a backtick', 'echo `git log`', ['git log']],
  ['a substitution inside double quotes', 'echo "$(git log)"', ['git log']],
  ['a closing parenthesis inside quotes', "out=$(echo ')'; git log)", ["echo ')'; git log"]],
  ['a nested substitution, once', 'echo $(a $(b))', ['a $(b)']],
  ['a substitution inside a parameter default', `echo \${x:-$(git log)}`, ['git log']],
  ['a quote inside a parameter', `echo "\${x:-"it's"}" $(git log)`, ['git log']],
  ['a process substitution', 'diff <(git log) b', ['git log']],
  ['a substitution after a word-joined one', 'ref=$(a)#L1 && echo $(b)', ['a', 'b']],
  ['an ANSI quote with an escaped quote', String.raw`echo $'it\'s' $(git log)`, ['git log']],
  [
    'a backtick whose body holds a quote',
    "echo `echo it's` $(git log) 'x'",
    ["echo it's", 'git log'],
  ],
  ['an unclosed quote before a substitution', "echo it's $(git log)", ['git log']],
])('it collects the body of %s', (_label, text, substitutions) => {
  expect(splitShellTokens(text).substitutions).toStrictEqual(substitutions);
});

test.each([
  ['single quotes', "echo '$(git log)'"],
  ['an escaped dollar sign', String.raw`echo \$(git log)`],
  ['an escaped dollar sign inside double quotes', String.raw`echo "\$(git log)"`],
  ['escaped backticks inside double quotes', 'echo "\\`git log\\`"'],
  ['an escaped dollar sign before an ANSI quote', String.raw`echo \$'a\' 'b'`],
  ['a comment', 'echo ok # $(git log)'],
  ['a comment after a continued line', 'echo ok;\\\n# $(git log)'],
  ['a quoted heredoc', "cat <<'EOF'\n$(git log)\nEOF"],
])('it collects no substitution from %s', (_label, text) => {
  expect(splitShellTokens(text).substitutions).toStrictEqual([]);
});

test.each([
  ['after a space', 'echo ok # note', '# note'],
  ['after a separator', 'echo ok;# note', '# note'],
  ['after a grouping parenthesis', "(echo ok)# 'note", "# 'note"],
  ['after a line continuation', 'echo ok \\\n# note', '# note'],
  ['after an escaped backslash at the end of a line', "echo a\\\\\n# don't", "# don't"],
])('it reads a # %s as a comment', (_label, text, comment) => {
  expect(splitShellTokens(text).tokens.filter((token) => token.kind === 'comment')).toStrictEqual([
    { kind: 'comment', text: comment, start: text.indexOf('#'), end: text.length },
  ]);
});

test.each([
  ['inside a word', 'echo a#b'],
  ['after a substitution in the same word', 'echo $(a)#b'],
  ['after an escaped space', String.raw`echo foo\ #b`],
  ['after an escaped separator', String.raw`echo foo\;#b`],
  ['after a line continuation inside a word', 'echo foo\\\n#b'],
])('it keeps a # %s in its word', (_label, text) => {
  expect(splitShellTokens(text).tokens.map((token) => token.kind)).toStrictEqual(['word', 'word']);
});

test('it reads a heredoc body as one token and the line after it as a command', () => {
  expect(splitShellTokens('cat <<EOF\nrm x\nEOF\nls').tokens).toStrictEqual([
    { kind: 'word', value: 'cat', raw: 'cat', start: 0, end: 3 },
    { kind: 'redirect', operator: '<<', target: 'EOF', start: 4, end: 9 },
    { kind: 'separator', operator: '\n', start: 9, end: 10 },
    { kind: 'heredoc', body: 'rm x\n', isQuoted: false, start: 10, end: 18 },
    { kind: 'separator', operator: '\n', start: 18, end: 19 },
    { kind: 'word', value: 'ls', raw: 'ls', start: 19, end: 21 },
  ]);
});

test.each([
  ['an unquoted heredoc', "cat <<EOF\nit's $(git log)\nEOF", ['git log']],
  ['a heredoc that strips tabs', 'cat <<-EOF\n\t$(git log)\n\tEOF', ['git log']],
  [
    'a heredoc whose delimiter follows a line continuation',
    'cat <<\\\nEOF\n$(git log)\nEOF',
    ['git log'],
  ],
  [
    'a quoted heredoc inside a substitution',
    `git commit -m "$(cat <<'EOF'\nDon't stop\nEOF\n)" && echo $(git log)`,
    ["cat <<'EOF'\nDon't stop\nEOF\n", 'git log'],
  ],
])('it collects the substitutions in %s', (_label, text, substitutions) => {
  expect(splitShellTokens(text).substitutions).toStrictEqual(substitutions);
});

test('it opens no heredoc for a shift inside an arithmetic command', () => {
  expect(splitShellTokens('(( x = 1<<2 ))\nrm x').tokens.at(-1)).toStrictEqual({
    kind: 'word',
    value: 'x',
    raw: 'x',
    start: 18,
    end: 19,
  });
});

test('it reads a line continuation between words as no word', () => {
  expect(splitShellTokens('git push \\\n  origin').tokens.map((token) => token.kind)).toStrictEqual(
    ['word', 'word', 'word'],
  );
});

test('it reports a substitution that never closes as unterminated', () => {
  expect(splitShellTokens('echo $(git log').isUnterminated).toBeTrue();
});

test('it reports an unterminated quote in a redirection target', () => {
  expect(splitShellTokens("echo > 'out").isUnterminated).toBeTrue();
});
