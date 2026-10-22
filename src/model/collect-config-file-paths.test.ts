import { expect, test } from 'bun:test';
import { collectConfigFilePaths } from './collect-config-file-paths.ts';

test('it collects each global or system git config the command names once, in order', () => {
  expect(
    collectConfigFilePaths(
      'GIT_CONFIG_GLOBAL=/tmp/quick.gitconfig git push && export GIT_CONFIG_SYSTEM="ci config" GIT_CONFIG_GLOBAL= ; env GIT_CONFIG_SYSTEM=/tmp/quick.gitconfig gh stack sync',
    ),
  ).toStrictEqual(['/tmp/quick.gitconfig', 'ci config', '']);
});

test('it leaves out a value the command text cannot resolve', () => {
  expect(
    collectConfigFilePaths('GIT_CONFIG_GLOBAL=$CONFIG GIT_CONFIG_SYSTEM=~/ci.gitconfig git push'),
  ).toStrictEqual([]);
});

test('it collects nothing from a command that names no git config file', () => {
  expect(collectConfigFilePaths('GIT_CONFIG_NOSYSTEM=1 git push')).toStrictEqual([]);
});
