import { expect, test } from 'bun:test';
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
