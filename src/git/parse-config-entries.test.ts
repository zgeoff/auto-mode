import { expect, test } from 'bun:test';
import type { ConfigEntry } from './parse-config-entries.ts';
import { parseConfigEntries } from './parse-config-entries.ts';

test('it reads core.hooksPath and each include in file order', () => {
  expect(
    parseConfigEntries(
      [
        '[include]',
        '\tpath = shared/hooks.config',
        '[Core]',
        '\tbare = false',
        '\tHooksPath = "checks" ; local',
        '[include]',
        '\tPATH = ~/.gitconfig.hooks',
        '[user]',
        '\thooksPath = no',
        '',
      ].join('\n'),
      { path: '/srv/harbor/.git/config', home: '/home/robin', depth: 0 },
    ),
  ).toStrictEqual([
    { kind: 'include', path: '/srv/harbor/.git/shared/hooks.config' },
    { kind: 'hooks-path', value: 'checks' },
    { kind: 'include', path: '/home/robin/.gitconfig.hooks' },
  ]);
});

test.each<[string, readonly ConfigEntry[]]>([
  ['[core] hooksPath = /tmp/no-hooks', [{ kind: 'hooks-path', value: '/tmp/no-hooks' }]],
  ['[core]hooksPath=/tmp/no-hooks', [{ kind: 'hooks-path', value: '/tmp/no-hooks' }]],
  ['[Core] HooksPath = "/tmp/no hooks"', [{ kind: 'hooks-path', value: '/tmp/no hooks' }]],
  ['[core "x"] hooksPath = /tmp/no-hooks', []],
  ['[include] path = more.config', [{ kind: 'include', path: '/srv/harbor/.git/more.config' }]],
  ['[includeIf "gitdir:/srv/"] path = more.config', [{ kind: 'unknown' }]],
])('it reads the assignment on the section header line %s', (config, expected) => {
  expect(
    parseConfigEntries(config, { path: '/srv/harbor/.git/config', home: '/home/robin', depth: 0 }),
  ).toStrictEqual(expected);
});

test('it joins a value that ends in a backslash with the next line', () => {
  expect(
    parseConfigEntries('[core]\n\thooksPath = /srv/harbor/.git/hooks\\\n-other\n', {
      path: '/srv/harbor/.git/config',
      home: '/home/robin',
      depth: 0,
    }),
  ).toStrictEqual([{ kind: 'hooks-path', value: '/srv/harbor/.git/hooks-other' }]);
});

test('it reads the line after a comment that ends in a backslash on its own', () => {
  expect(
    parseConfigEntries('[core] ; shared \\\n\thooksPath = /tmp/no-hooks\n', {
      path: '/srv/harbor/.git/config',
      home: '/home/robin',
      depth: 0,
    }),
  ).toStrictEqual([{ kind: 'hooks-path', value: '/tmp/no-hooks' }]);
});

test('it keeps the whitespace inside a quoted hooks folder', () => {
  expect(
    parseConfigEntries('[core]\n\thooksPath = "/srv/harbor/.git/hooks "\n', {
      path: '/srv/harbor/.git/config',
      home: '/home/robin',
      depth: 0,
    }),
  ).toStrictEqual([{ kind: 'hooks-path', value: '/srv/harbor/.git/hooks ' }]);
});

test.each([
  ['a file git refuses', '[core]\n\thooksPath = "open\n'],
  ['a hooks folder key with no value', '[core]\n\thooksPath\n'],
])('it reads %s as unknown', (_, config) => {
  expect(
    parseConfigEntries(config, { path: '/srv/harbor/.git/config', home: '/home/robin', depth: 0 }),
  ).toStrictEqual([{ kind: 'unknown' }]);
});

test('it reads an includeIf as unknown', () => {
  expect(
    parseConfigEntries('[includeIf "gitdir:~/work/"]\n\tpath = work.config\n', {
      path: '/home/robin/.gitconfig',
      home: '/home/robin',
      depth: 0,
    }),
  ).toStrictEqual([{ kind: 'unknown' }]);
});

test('it reads an include at git depth limit as unknown', () => {
  expect(
    parseConfigEntries('[include]\n\tpath = next.config\n', {
      path: '/srv/harbor/.git/config',
      home: '/home/robin',
      depth: 10,
    }),
  ).toStrictEqual([{ kind: 'unknown' }]);
});

test('it reads an include one below git depth limit', () => {
  expect(
    parseConfigEntries('[include]\n\tpath = next.config\n', {
      path: '/srv/harbor/.git/config',
      home: '/home/robin',
      depth: 9,
    }),
  ).toStrictEqual([{ kind: 'include', path: '/srv/harbor/.git/next.config' }]);
});
