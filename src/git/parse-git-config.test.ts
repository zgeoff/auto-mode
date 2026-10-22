import { expect, test } from 'bun:test';
import type { ConfigVariable } from './parse-git-config.ts';
import { parseGitConfig } from './parse-git-config.ts';

test('it reads each variable in file order, with its section and key in lower case', () => {
  expect(
    parseGitConfig(
      [
        '# leading comment',
        '[Core]',
        '\tbare = false',
        '\tHooksPath = checks',
        '[remote "Origin"]',
        '\turl = git@example.com:dev/app.git',
        '[include]',
        '\tpath = more.config',
        '',
      ].join('\n'),
    ),
  ).toStrictEqual([
    { name: 'core.bare', value: 'false' },
    { name: 'core.hookspath', value: 'checks' },
    { name: 'remote.Origin.url', value: 'git@example.com:dev/app.git' },
    { name: 'include.path', value: 'more.config' },
  ]);
});

test.each<[string, string, readonly ConfigVariable[]]>([
  [
    'an assignment on the header line',
    '[core] hooksPath = /a',
    [{ name: 'core.hookspath', value: '/a' }],
  ],
  [
    'a header with no space before the key',
    '[core]hooksPath=/a',
    [{ name: 'core.hookspath', value: '/a' }],
  ],
  ['a quoted subsection', '[core "X"] hooksPath = /a', [{ name: 'core.X.hookspath', value: '/a' }]],
  [
    'an escaped quote in a subsection',
    '[remote "o\\"x"]\nurl = u',
    [{ name: 'remote.o"x.url', value: 'u' }],
  ],
  [
    'the dotted subsection form',
    '[Core.X]\nhooksPath = /a',
    [{ name: 'core.x.hookspath', value: '/a' }],
  ],
  ['a key before any section', 'hooksPath = /a', [{ name: 'hookspath', value: '/a' }]],
  ['a key with no value', '[core]\n\tbare', [{ name: 'core.bare', value: null }]],
  ['CRLF line ends', '[core]\r\n\thooksPath = /a\r\n', [{ name: 'core.hookspath', value: '/a' }]],
  [
    'a byte order mark',
    `${String.fromCodePoint(0xfe_ff)}[core]\nhooksPath = /a`,
    [{ name: 'core.hookspath', value: '/a' }],
  ],
])('it reads %s', (_, config, expected) => {
  expect(parseGitConfig(config)).toStrictEqual(expected);
});

test.each([
  ['unquoted whitespace around the value', '  /srv/hooks  ', '/srv/hooks'],
  ['whitespace inside quotes', '"/srv/hooks "', '/srv/hooks '],
  ['whitespace between words', '/srv/a\tb  c', '/srv/a\tb  c'],
  ['quotes inside a word', '/srv/"x y"', '/srv/x y'],
  ['a comment after the value', '/srv/hooks ; shared', '/srv/hooks'],
  ['a comment sign inside quotes', '"/srv/hooks # kept" # comment', '/srv/hooks # kept'],
  ['the escapes git knows', String.raw`"a\"b\\c\td\ne\bf"`, 'a"b\\c\td\ne\bf'],
  ['a line that ends in a backslash', '/srv/hooks\\\n-other', '/srv/hooks-other'],
])('it reads a value with %s', (_, raw, expected) => {
  expect(parseGitConfig(`[core]\n\thooksPath = ${raw}\n`)).toStrictEqual([
    { name: 'core.hookspath', value: expected },
  ]);
});

test('it ends a comment at its line end, even after a backslash', () => {
  expect(parseGitConfig('[core] ; shared \\\n\thooksPath = /a\n')).toStrictEqual([
    { name: 'core.hookspath', value: '/a' },
  ]);
});

test.each([
  ['an unknown escape', '[core]\n\thooksPath = "a\\qb"'],
  ['an open quote', '[core]\n\thooksPath = "open'],
  ['a comment after a key with no value', '[core]\n\thooksPath # note'],
  ['an empty section name', '[]\nbare = true'],
  ['an unclosed section header', '[core'],
  ['a header with text after its subsection', '[core "x" y]'],
  ['a key that starts with a digit', '[core]\n\t1key = x'],
])('it refuses a file with %s, as git does', (_, config) => {
  expect(parseGitConfig(config)).toBeNull();
});
