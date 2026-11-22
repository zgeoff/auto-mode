import { expect, test } from 'bun:test';
import { parseShellCommand } from './parse-shell-command.ts';

test('it reads segments with their words, redirections and offsets', () => {
  expect(parseShellCommand(`cd 'my dir' && echo "a b" 2> err.log | wc -l`)).toStrictEqual({
    segments: [
      {
        text: "cd 'my dir'",
        start: 0,
        end: 11,
        words: [
          { raw: 'cd', value: 'cd', parts: [], hasError: false },
          { raw: "'my dir'", value: 'my dir', parts: expect.toBeArrayOfSize(1), hasError: false },
        ],
        redirects: [],
        substitutions: [],
        isPiped: false,
        scopes: [],
      },
      {
        text: 'echo "a b" 2> err.log',
        start: 15,
        end: 36,
        words: [
          { raw: 'echo', value: 'echo', parts: [], hasError: false },
          { raw: '"a b"', value: 'a b', parts: expect.toBeArrayOfSize(1), hasError: false },
        ],
        redirects: [{ operator: '>', descriptor: 2, target: 'err.log', heredoc: null, start: 26 }],
        substitutions: [],
        isPiped: false,
        scopes: [],
      },
      {
        text: 'wc -l',
        start: 39,
        end: 44,
        words: [
          { raw: 'wc', value: 'wc', parts: [], hasError: false },
          { raw: '-l', value: '-l', parts: [], hasError: false },
        ],
        redirects: [],
        substitutions: [],
        isPiped: true,
        scopes: [],
      },
    ],
    hasError: false,
    hasSubstitution: false,
    hasCompound: false,
    hasPipe: true,
  });
});

test('it gives the same tree for the same text', () => {
  expect(parseShellCommand('a >> b; c <in')).toStrictEqual(parseShellCommand('a >> b; c <in'));
});

test.each([
  [
    'an appending redirection',
    'echo hi >>out',
    { operator: '>>', descriptor: null, target: 'out' },
  ],
  [
    'a clobbering redirection',
    'echo hi >| out',
    { operator: '>|', descriptor: null, target: 'out' },
  ],
  [
    'a redirection of both streams',
    'make &> build.log',
    { operator: '&>', descriptor: null, target: 'build.log' },
  ],
  ['a descriptor duplication', 'make 2>&1', { operator: '>&', descriptor: 2, target: '1' }],
  ['an input redirection', 'cat < in.txt', { operator: '<', descriptor: null, target: 'in.txt' }],
])('it reads %s as one redirection with its target', (_label, text, redirect) => {
  expect(parseShellCommand(text).segments.at(-1)?.redirects).toStrictEqual([
    { ...redirect, heredoc: null, start: expect.any(Number) },
  ]);
});

test('it reads a heredoc as a redirection whose target is its delimiter', () => {
  expect(parseShellCommand('cat <<EOF').segments.at(-1)?.redirects).toStrictEqual([
    {
      operator: '<<',
      descriptor: null,
      target: 'EOF',
      heredoc: { body: '', isQuoted: false, substitutions: [] },
      start: 4,
    },
  ]);
});

test('it reads a redirection that touches the word before it apart from that word', () => {
  expect(parseShellCommand('a>b').segments).toStrictEqual([
    {
      text: 'a>b',
      start: 0,
      end: 3,
      words: [{ raw: 'a', value: 'a', parts: [], hasError: false }],
      redirects: [{ operator: '>', descriptor: null, target: 'b', heredoc: null, start: 1 }],
      substitutions: [],
      isPiped: false,
      scopes: [],
    },
  ]);
});

test('it keeps a quoted number before a redirection as a word', () => {
  const [segment] = parseShellCommand('echo "2">x').segments;

  expect([segment?.words.map((word) => word.raw), segment?.redirects]).toStrictEqual([
    ['echo', '"2"'],
    [{ operator: '>', descriptor: null, target: 'x', heredoc: null, start: 8 }],
  ]);
});

test('it ends a redirection target at a parenthesis', () => {
  expect(parseShellCommand('(echo x > out)').segments.at(-1)?.redirects).toStrictEqual([
    { operator: '>', descriptor: null, target: 'out', heredoc: null, start: 8 },
  ]);
});

test('it reads a redirection with nothing after it as one without a target, and an error', () => {
  const tree = parseShellCommand('echo >');

  expect([tree.hasError, tree.segments.at(-1)?.redirects]).toStrictEqual([
    true,
    [{ operator: '>', descriptor: null, target: null, heredoc: null, start: 5 }],
  ]);
});

test('it keeps an escaped operator inside the word', () => {
  expect(
    parseShellCommand(String.raw`a\;b`).segments.map((segment) => segment.words),
  ).toStrictEqual([[{ raw: String.raw`a\;b`, value: 'a;b', parts: [], hasError: false }]]);
});

test('it reads a newline as a separator', () => {
  expect(parseShellCommand('a\nb').segments.map((segment) => segment.text)).toStrictEqual([
    'a',
    'b',
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
  expect(parseShellCommand(text).hasSubstitution).toBeTrue();
});

test('it reads a substitution inside single quotes as plain text', () => {
  expect(parseShellCommand("echo '$(cat .env)'").hasSubstitution).toBeFalse();
});

test('it reports an unterminated quote and keeps the open word', () => {
  const tree = parseShellCommand("echo 'open");

  expect([tree.hasError, tree.segments.map((segment) => segment.words)]).toStrictEqual([
    true,
    [
      [
        { raw: 'echo', value: 'echo', parts: [], hasError: false },
        { raw: "'open", value: 'open', parts: expect.toBeArrayOfSize(1), hasError: true },
      ],
    ],
  ]);
});

test.each([
  ['a double-quoted substitution', 'cat <<"$(git log)"\nnotes\n$(git log)'],
  ['a bare substitution', 'cat <<-$(git log)\nnotes\n$(git log)'],
  ['a backtick', 'cat <<`git log`\nnotes\n`git log`'],
])('it reads a heredoc delimiter that holds %s as text that runs nothing', (_label, text) => {
  expect(parseShellCommand(text).hasSubstitution).toBeFalse();
});

test.each([
  ['after a space', 'echo ok # note'],
  ['after a separator', 'echo ok;# note'],
  ['after a grouping parenthesis', "(echo ok)# 'note"],
  ['after a line continuation', 'echo ok \\\n# note'],
])('it reads a # %s as a comment in no segment', (_label, text) => {
  const tree = parseShellCommand(text);

  expect([tree.hasError, tree.segments.map((segment) => segment.text)]).toStrictEqual([
    false,
    ['echo ok'],
  ]);
});

test('it reads a # after an escaped backslash at the end of a line as a comment', () => {
  const tree = parseShellCommand("echo a\\\\\n# don't");

  expect([tree.hasError, tree.segments.map((segment) => segment.text)]).toStrictEqual([
    false,
    [String.raw`echo a\\`],
  ]);
});

test.each([
  ['inside a word', 'echo a#b'],
  ['after a substitution in the same word', 'echo $(a)#b'],
  ['after an escaped space', String.raw`echo foo\ #b`],
  ['after an escaped separator', String.raw`echo foo\;#b`],
  ['after a line continuation inside a word', 'echo foo\\\n#b'],
])('it keeps a # %s in its word', (_label, text) => {
  expect(parseShellCommand(text).segments.map((segment) => segment.words.length)).toStrictEqual([
    2,
  ]);
});

test('it reads a heredoc body apart from its segment and the line after it as a command', () => {
  expect(parseShellCommand('cat <<EOF\nrm x\nEOF\nls').segments).toStrictEqual([
    {
      text: 'cat <<EOF',
      start: 0,
      end: 9,
      words: [{ raw: 'cat', value: 'cat', parts: [], hasError: false }],
      redirects: [
        {
          operator: '<<',
          descriptor: null,
          target: 'EOF',
          heredoc: { body: 'rm x\n', isQuoted: false, substitutions: [] },
          start: 4,
        },
      ],
      substitutions: [],
      isPiped: false,
      scopes: [],
    },
    {
      text: 'ls',
      start: 19,
      end: 21,
      words: [{ raw: 'ls', value: 'ls', parts: [], hasError: false }],
      redirects: [],
      substitutions: [],
      isPiped: false,
      scopes: [],
    },
  ]);
});

test('it opens no heredoc for a shift inside an arithmetic command', () => {
  expect(parseShellCommand('(( x = 1<<2 ))\nrm x').segments.at(-1)?.text).toBe('rm x');
});

test.each([
  ['a delimiter before a grouping parenthesis', '(cat <<EOF)\nhello\nEOF\ngit log', 22],
  [
    'a shift after a bitwise operator in an arithmetic command',
    '(( x = 1 & 2 << 3 ))\ngit log',
    21,
  ],
  ['a heredoc that follows an arithmetic command', "((1<<2))\ncat <<EOF\n'\nEOF\ngit log", 25],
  ['a single-quoted brace in a parameter default', `echo \${x:-'{}'}; git log`, 17],
  ['a heredoc whose delimiter line is continued', 'cat <<EOF\nignored\nE\\\nOF\ngit log', 24],
  ['a heredoc whose delimiter is an ANSI-C quote', "cat <<$'EOF'\nnotes\nEOF\ngit log", 23],
  ['a heredoc whose ANSI-C delimiter holds an escape', "cat <<$'E\\x4fF'\nx\nEOF\ngit log", 22],
  ['a heredoc whose delimiter is a locale quote', 'cat <<$"EOF"\ny\nEOF\ngit log', 19],
  ['a heredoc whose quoted delimiter holds a backslash', "cat <<'E\\OF'\nbody\nE\\OF\ngit log", 23],
  ['a bare opening brace in a parameter default', `echo \${x:-{}; git log`, 14],
])('it reads the line after %s as a command', (_label, text, start) => {
  const segment = parseShellCommand(text).segments.at(-1);

  expect([segment?.text, segment?.start]).toStrictEqual(['git log', start]);
});

test('it reads a line continuation between words as no word', () => {
  expect(
    parseShellCommand('git push \\\n  origin').segments.map((segment) => segment.words.length),
  ).toStrictEqual([3]);
});

test('it reports a substitution that never closes as an error', () => {
  expect(parseShellCommand('echo $(git log').hasError).toBeTrue();
});

test('it reports an unterminated quote in a redirection target as an error', () => {
  expect(parseShellCommand("echo > 'out").hasError).toBeTrue();
});

test('it reports an error inside a substitution as an error of the command', () => {
  expect(parseShellCommand("echo $(echo 'open)").hasError).toBeTrue();
});

test.each([
  ['&&', 'ls && pwd', 6, 9],
  ['||', 'ls || pwd', 6, 9],
  [';', 'ls ; pwd', 5, 8],
  ['|', 'ls | pwd', 5, 8],
  ['&', 'ls & pwd', 5, 8],
  ['a newline', 'ls\npwd', 3, 6],
])('it splits a chain joined by %s', (_operator, command, start, end) => {
  const tree = parseShellCommand(command);

  expect([
    tree.hasError,
    tree.segments.map((segment) => [segment.text, segment.start, segment.end]),
  ]).toStrictEqual([
    false,
    [
      ['ls', 0, 2],
      ['pwd', start, end],
    ],
  ]);
});

test.each([
  [
    'a comment',
    'ls # list it\npwd',
    [
      ['ls', 0, 2],
      ['pwd', 13, 16],
    ],
  ],
  [
    'a heredoc body',
    'cat <<EOF\nrm -rf x\nEOF\npwd',
    [
      ['cat <<EOF', 0, 9],
      ['pwd', 23, 26],
    ],
  ],
])('it leaves %s out of every segment', (_label, command, segments) => {
  expect(
    parseShellCommand(command).segments.map((segment) => [
      segment.text,
      segment.start,
      segment.end,
    ]),
  ).toStrictEqual(segments);
});

test('it reads the segments after an operator with no command before it, and an error', () => {
  const tree = parseShellCommand('ls &&  && pwd');

  expect([
    tree.hasError,
    tree.segments.map((segment) => [segment.text, segment.start, segment.end]),
  ]).toStrictEqual([
    true,
    [
      ['ls', 0, 2],
      ['pwd', 10, 13],
    ],
  ]);
});

test.each([
  ['inside double quotes', 'echo "a && b"'],
  ['inside single quotes', "echo 'a | b'"],
  ['escaped', String.raw`echo a \&\& b`],
])('it leaves an operator %s in its word', (_label, command) => {
  expect(parseShellCommand(command).segments.map((segment) => segment.text)).toStrictEqual([
    command,
  ]);
});

test.each([
  ['a subshell', '(ls)'],
  ['a brace group', '{ ls; }'],
  ['an if', 'if true; then ls; fi'],
  ['a loop', 'for f in a b; do ls "$f"; done'],
  ['a function', 'f() { ls; }'],
  ['an arithmetic command', '(( 1 + 2 ))'],
  ['a test', '[[ -f x ]]'],
  ['a negation', '! ls'],
  ['a timed pipeline', 'time ls'],
])('it reports %s as a compound command', (_label, command) => {
  expect(parseShellCommand(command).hasCompound).toBeTrue();
});

test('it reads the commands inside a compound command as segments', () => {
  expect(
    parseShellCommand('if test -d x; then rm -rf x; fi').segments.map((segment) => segment.text),
  ).toStrictEqual(['test -d x', 'rm -rf x']);
});

test('it puts a subshell and a compound body each in a scope of their own', () => {
  expect(
    parseShellCommand('(cd a); while true; do cd b; done').segments.map((segment) =>
      segment.scopes.map((scope) => scope.kind),
    ),
  ).toStrictEqual([['subshell'], ['conditional'], ['conditional']]);
});

test('it reports an empty command as no segments', () => {
  expect(parseShellCommand('   ')).toStrictEqual({
    segments: [],
    hasError: false,
    hasSubstitution: false,
    hasCompound: false,
    hasPipe: false,
  });
});

test('it reads twenty nested $(( command substitutions in under 10 ms', () => {
  let text = 'echo 1';

  for (let level = 0; level < 20; level += 1) {
    text = `$((echo ${text}); echo 1)`;
  }

  const startedAt = performance.now();
  const tree = parseShellCommand(text);
  const elapsedMs = performance.now() - startedAt;

  expect(tree.segments.flatMap((segment) => segment.substitutions)).toStrictEqual([
    text.slice(2, -1),
  ]);

  expect(elapsedMs).toBeLessThan(10);
});
