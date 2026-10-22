import { expect, test } from 'bun:test';
import { collectGlobalConfigPaths } from './collect-global-config-paths.ts';

test('it collects each GIT_CONFIG_GLOBAL value the command names once, in order', () => {
  expect(
    collectGlobalConfigPaths(
      'GIT_CONFIG_GLOBAL=/tmp/quick.gitconfig git push && export GIT_CONFIG_GLOBAL="ci config" GIT_CONFIG_GLOBAL= ; env GIT_CONFIG_GLOBAL=/tmp/quick.gitconfig gh stack sync',
    ),
  ).toStrictEqual(['/tmp/quick.gitconfig', 'ci config', '']);
});

test('it leaves out a value the command text cannot resolve', () => {
  expect(
    collectGlobalConfigPaths('GIT_CONFIG_GLOBAL=$CONFIG GIT_CONFIG_GLOBAL=~/ci.gitconfig git push'),
  ).toStrictEqual([]);
});

test('it collects nothing from a command that names no global git config', () => {
  expect(collectGlobalConfigPaths('LEFTHOOK_BIN=/bin/true git push')).toStrictEqual([]);
});
