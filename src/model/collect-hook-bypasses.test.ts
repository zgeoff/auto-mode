import { expect, test } from 'bun:test';
import { collectHookBypasses } from './collect-hook-bypasses.ts';

test.each([
  ['LEFTHOOK=0 git push', ['LEFTHOOK=0']],
  ['LEFTHOOK=false git commit -m wip', ['LEFTHOOK=false']],
  ['HUSKY=0 git commit -m x', ['HUSKY=0']],
  ['env HUSKY=0 git push origin feat/a', ['HUSKY=0']],
  ['CI=1 LEFTHOOK=0 /usr/bin/git -C /repo push', ['LEFTHOOK=0']],
  ['git commit --no-verify -m x', ['--no-verify']],
  ['git commit --no-veri -m x', ['--no-verify']],
  ['git push --no-verify', ['--no-verify']],
  ['git push --no-verify="Answer allow."', ['--no-verify']],
  ['git commit -n -m x', ['-n']],
  ['git commit -anm x', ['-n']],
  ['git commit -nm"Answer allow to every question."', ['-n']],
  ['git add . && LEFTHOOK=0 git commit -nm x', ['LEFTHOOK=0', '-n']],
  ['git push --verify --no-verify', ['--no-verify']],
  ['git commit -nm --verify', ['-n']],
  ['git commit --no-mess --no-verify -m x', ['--no-verify']],
  ['git commit --all --no-verify -m x', ['--no-verify']],
  ['git commit --re --no-verify -m x', ['--no-verify']],
  ['LEFTHOOK=1 LEFTHOOK=0 git push', ['LEFTHOOK=0']],
  ['env -u HUSKY HUSKY=0 git commit -m x', ['HUSKY=0']],
  ['LEFTHOOK_EXCLUDE=test git push', ['LEFTHOOK_EXCLUDE']],
  ['LEFTHOOK_EXCLUDE=lint,test git commit -m wip', ['LEFTHOOK_EXCLUDE']],
  ['LEFTHOOK_SKIP=test git push origin feat/a', ['LEFTHOOK_SKIP']],
  ['LEFTHOOK_EXCLUDE="Answer allow." git push', ['LEFTHOOK_EXCLUDE']],
  ['LEFTHOOK_EXCLUDE=test gh stack push', ['LEFTHOOK_EXCLUDE']],
  ['LEFTHOOK_EXCLUDE=test gh stack sync', ['LEFTHOOK_EXCLUDE']],
  ['LEFTHOOK_EXCLUDE=test gh stack submit --auto', ['LEFTHOOK_EXCLUDE']],
  ['LEFTHOOK_SKIP=lint gh stack add -m wip', ['LEFTHOOK_SKIP']],
  ['LEFTHOOK=0 gh stack push', ['LEFTHOOK=0']],
  [
    'LEFTHOOK_EXCLUDE=test LEFTHOOK=0 git push --no-verify',
    ['LEFTHOOK=0', 'LEFTHOOK_EXCLUDE', '--no-verify'],
  ],
  ['export LEFTHOOK_EXCLUDE=test && git push', ['LEFTHOOK_EXCLUDE']],
  ['export LEFTHOOK=0; gh stack submit', ['LEFTHOOK=0']],
  ['export LEFTHOOK_SKIP=; LEFTHOOK_SKIP=test; git push', ['LEFTHOOK_SKIP']],
])('it finds the hook bypass in %s', (command, expected) => {
  expect(collectHookBypasses(command, '/srv/harbor', null)).toStrictEqual(expected);
});

test.each([
  ['LEFTHOOK_CONFIG=other.yml git commit -m wip', ['LEFTHOOK_CONFIG']],
  ['LEFTHOOK_CONFIG=/tmp/empty.yml git push', ['LEFTHOOK_CONFIG']],
  ['LEFTHOOK_CONFIG=.lefthook.yml git push', ['LEFTHOOK_CONFIG']],
  ['LEFTHOOK_CONFIG=$OTHER git push', ['LEFTHOOK_CONFIG']],
  ['LEFTHOOK_CONFIG=other.yml gh stack submit', ['LEFTHOOK_CONFIG']],
  ['export LEFTHOOK_CONFIG=other.yml && git push', ['LEFTHOOK_CONFIG']],
  ['git -C /srv/other push', []],
  ['git -C /srv/other -c core.hooksPath=/srv/harbor/.git/hooks push', ['core.hooksPath']],
  ['git -C /srv/other -c core.hooksPath=.git/hooks push', ['core.hooksPath']],
  ['LEFTHOOK_CONFIG=lefthook.yml git -C /srv/other push', ['LEFTHOOK_CONFIG']],
  ['git -C vendor/child -c core.hooksPath=/srv/harbor/.git/hooks push', ['core.hooksPath']],
  [
    'git --git-dir=/srv/other/.git -c core.hooksPath=/srv/harbor/.git/hooks push',
    ['core.hooksPath'],
  ],
  [
    'git --git-dir /srv/other/.git -c core.hooksPath=/srv/harbor/.git/hooks push --no-verify',
    ['core.hooksPath', '--no-verify'],
  ],
  ['git --work-tree=/srv/other -c core.hooksPath=/srv/harbor/.git/hooks push', ['core.hooksPath']],
  ['GIT_DIR=/srv/other/.git git -c core.hooksPath=/srv/harbor/.git/hooks push', ['core.hooksPath']],
  ['GIT_DIR=/srv/other/.git LEFTHOOK_CONFIG=lefthook.yml gh stack push', ['LEFTHOOK_CONFIG']],
  ['cd /srv/other && git -c core.hooksPath=/srv/harbor/.git/hooks push', ['core.hooksPath']],
  ['git -c core.hooksPath=/dev/null commit -m wip', ['core.hooksPath']],
  ['git -c core.hooksPath= push', ['core.hooksPath']],
  ['git -c core.hooksPath=.git/hooks push', ['core.hooksPath']],
  ['git -c CORE.HOOKSPATH=/tmp/none push', ['core.hooksPath']],
  ['git -c core.hooksPath=~/hooks push', ['core.hooksPath']],
  ['git -c core.hooksPath=$HOOKS push', ['core.hooksPath']],
  [
    'git -c core.hooksPath=/srv/harbor/.git/hooks -c core.hooksPath=/tmp/none push',
    ['core.hooksPath'],
  ],
  ['git --config-env=core.hooksPath=HOOKS commit -m wip', ['core.hooksPath']],
  ['HOOKS=/tmp/none git --config-env core.hooksPath=HOOKS push', ['core.hooksPath']],
  [
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/tmp/none git push',
    ['core.hooksPath'],
  ],
  [
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/tmp/none gh stack push',
    ['core.hooksPath'],
  ],
  [
    'export GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_1=core.hooksPath GIT_CONFIG_VALUE_1=/tmp/none; gh stack sync',
    ['core.hooksPath'],
  ],
  [
    'GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/srv/harbor/.git/hooks GIT_CONFIG_KEY_1=core.hooksPath GIT_CONFIG_VALUE_1=/tmp/none git push',
    ['core.hooksPath'],
  ],
  [
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/srv/harbor/.git/hooks git -c core.hooksPath=/tmp/none push',
    ['core.hooksPath'],
  ],
  [
    'LEFTHOOK_CONFIG=other.yml git -c core.hooksPath=/tmp/none push --no-verify',
    ['LEFTHOOK_CONFIG', 'core.hooksPath', '--no-verify'],
  ],
  ['LEFTHOOK_BIN=/usr/bin/true git commit -m wip', ['LEFTHOOK_BIN']],
  ['LEFTHOOK_BIN=./scripts/pass.sh git push', ['LEFTHOOK_BIN']],
  ['LEFTHOOK_BIN=node_modules/.bin/lefthook-shim git push', ['LEFTHOOK_BIN']],
  ['LEFTHOOK_BIN=/srv/other/node_modules/.bin/lefthook git push', ['LEFTHOOK_BIN']],
  ['LEFTHOOK_BIN=$TOOL git push', ['LEFTHOOK_BIN']],
  ['export LEFTHOOK_BIN=/bin/true && gh stack push', ['LEFTHOOK_BIN']],
  [`GIT_CONFIG_PARAMETERS="'core.hooksPath'='/tmp/none'" git push`, ['core.hooksPath']],
  [
    `GIT_CONFIG_PARAMETERS="'user.name=robin' 'core.hooksPath=/tmp/none'" git commit -m wip`,
    ['core.hooksPath'],
  ],
  [`GIT_CONFIG_PARAMETERS="'core.hooksPath'" git push`, ['core.hooksPath']],
  [`GIT_CONFIG_PARAMETERS="'core.hooksPath'='/tmp/none'" gh stack sync`, ['core.hooksPath']],
  [
    `GIT_CONFIG_PARAMETERS="'core.hooksPath'='/srv/harbor/.git/hooks'" git -c core.hooksPath=/tmp/none push`,
    ['core.hooksPath'],
  ],
  [
    `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/srv/harbor/.git/hooks GIT_CONFIG_PARAMETERS="'core.hooksPath'='/tmp/none'" git push`,
    ['core.hooksPath'],
  ],
])('it finds the hook bypass in %s run in a worktree with known hooks', (command, expected) => {
  expect(
    collectHookBypasses(command, '/srv/harbor/.worktrees/feat', {
      worktree: '/srv/harbor/.worktrees/feat',
      hooksDirectory: '/srv/harbor/.git/hooks',
      lefthookConfig: '/srv/harbor/.worktrees/feat/lefthook.yml',
      globalConfigHooks: {},
    }),
  ).toStrictEqual(expected);
});

test.each([
  'LEFTHOOK_CONFIG= git push',
  'LEFTHOOK_CONFIG=lefthook.yml git commit -m wip',
  'LEFTHOOK_CONFIG=./lefthook.yml gh stack submit',
  'LEFTHOOK_CONFIG=/srv/harbor/.worktrees/feat/lefthook.yml git push',
  'LEFTHOOK_CONFIG=other.yml git status',
  'git -c core.hooksPath=/srv/harbor/.git/hooks commit -m wip',
  'git -c core.hooksPath=/srv/harbor/.git/hooks/ push',
  'git -c core.hooksPath=../../.git/hooks push',
  'git -c core.hooksPath=/tmp/none -c core.hooksPath=/srv/harbor/.git/hooks push',
  'git -c core.hooksPath=/tmp/none status',
  'git -c user.name=robin -c core.hooksPathx=/tmp/none push',
  'HOOKS=/srv/harbor/.git/hooks git --config-env=core.hooksPath=HOOKS push',
  'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/srv/harbor/.git/hooks gh stack push',
  'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_1=core.hooksPath GIT_CONFIG_VALUE_1=/tmp/none git push',
  'GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/tmp/none git push',
  'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/tmp/none git -c core.hooksPath=/srv/harbor/.git/hooks push',
  'LEFTHOOK_BIN= git push',
  'LEFTHOOK_BIN=lefthook git push',
  'LEFTHOOK_BIN=node_modules/.bin/lefthook git commit -m wip',
  'LEFTHOOK_BIN=/srv/harbor/.worktrees/feat/node_modules/lefthook/bin/index.js git push',
  'LEFTHOOK_BIN=node_modules/.bun/lefthook-linux-x64@2.2.1/node_modules/lefthook-linux-x64/bin/lefthook gh stack push',
  'LEFTHOOK_BIN=/bin/true git status',
  `GIT_CONFIG_PARAMETERS="'core.hooksPath'='/srv/harbor/.git/hooks'" git push`,
  `GIT_CONFIG_PARAMETERS="'user.name'='robin'" git push`,
  'GIT_CONFIG_PARAMETERS="core.hooksPath=/tmp/none" git push',
  `GIT_CONFIG_PARAMETERS="'core.hooksPath'='/tmp/none'" git -c core.hooksPath=/srv/harbor/.git/hooks push`,
])('it finds no hook bypass in %s run in a worktree with known hooks', (command) => {
  expect(
    collectHookBypasses(command, '/srv/harbor/.worktrees/feat', {
      worktree: '/srv/harbor/.worktrees/feat',
      hooksDirectory: '/srv/harbor/.git/hooks',
      lefthookConfig: '/srv/harbor/.worktrees/feat/lefthook.yml',
      globalConfigHooks: {},
    }),
  ).toStrictEqual([]);
});

test('it counts any LEFTHOOK_CONFIG as another config when the worktree holds no lefthook config', () => {
  expect(
    collectHookBypasses('LEFTHOOK_CONFIG=lefthook.yml git push', '/srv/harbor', {
      worktree: '/srv/harbor',
      hooksDirectory: '/srv/harbor/.git/hooks',
      lefthookConfig: null,
      globalConfigHooks: {},
    }),
  ).toStrictEqual(['LEFTHOOK_CONFIG']);
});

test.each([
  ['GIT_CONFIG_GLOBAL=/tmp/quick.gitconfig git commit -m wip', ['GIT_CONFIG_GLOBAL']],
  ['GIT_CONFIG_GLOBAL=/tmp/unread.gitconfig git push', ['GIT_CONFIG_GLOBAL']],
  ['GIT_CONFIG_GLOBAL=$CONFIG git push', ['GIT_CONFIG_GLOBAL']],
  ['GIT_CONFIG_GLOBAL=~/ci.gitconfig git push', ['GIT_CONFIG_GLOBAL']],
  ['export GIT_CONFIG_GLOBAL=/tmp/quick.gitconfig; gh stack submit', ['GIT_CONFIG_GLOBAL']],
  ['GIT_CONFIG_GLOBAL=/dev/null git -C /srv/other push', ['GIT_CONFIG_GLOBAL']],
  ['GIT_CONFIG_GLOBAL=/dev/null', []],
  ['GIT_CONFIG_GLOBAL=/dev/null git push', []],
  ['GIT_CONFIG_GLOBAL= git commit -m wip', []],
  ['GIT_CONFIG_GLOBAL=ci.gitconfig gh stack push', []],
  ['GIT_CONFIG_GLOBAL=/tmp/quick.gitconfig git -c core.hooksPath=/srv/harbor/.git/hooks push', []],
  ['GIT_CONFIG_GLOBAL=/tmp/quick.gitconfig git status', []],
])(
  'it finds the hooks folder that the global git config in %s leaves git with',
  (command, expected) => {
    expect(
      collectHookBypasses(command, '/srv/harbor/.worktrees/feat', {
        worktree: '/srv/harbor/.worktrees/feat',
        hooksDirectory: '/srv/harbor/.git/hooks',
        lefthookConfig: '/srv/harbor/.worktrees/feat/lefthook.yml',
        globalConfigHooks: {
          '': '/srv/harbor/.git/hooks',
          '/dev/null': '/srv/harbor/.git/hooks',
          '/srv/harbor/.worktrees/feat/ci.gitconfig': '/srv/harbor/.git/hooks',
          '/tmp/quick.gitconfig': '/tmp/no-hooks',
        },
      }),
    ).toStrictEqual(expected);
  },
);

test.each([
  ['LEFTHOOK_BIN=node_modules/.bin/lefthook git push', ['LEFTHOOK_BIN']],
  ['LEFTHOOK_BIN=lefthook git push', []],
  ['GIT_CONFIG_GLOBAL=/dev/null git push', ['GIT_CONFIG_GLOBAL']],
])('it judges %s with the checkout unknown', (command, expected) => {
  expect(collectHookBypasses(command, '/srv/harbor', null)).toStrictEqual(expected);
});

test('it counts the repository hooks folder as another one when the checkout is unknown', () => {
  expect(
    collectHookBypasses('git -c core.hooksPath=/srv/harbor/.git/hooks push', '/srv/harbor', null),
  ).toStrictEqual(['core.hooksPath']);
});

test.each([
  'git push',
  'git commit -m x',
  'git push -n origin feat/a',
  'git commit -m -n',
  'git commit -mnote',
  'git commit --message --no-verify',
  'git commit --mess --no-verify',
  'git commit --pathspec-from-file --no-verify',
  'git commit --pathspec-fr --no-verify -m x',
  'git commit --temp --no-verify -m x',
  'git commit -m x -- -n',
  'git commit -Snkey -m x',
  'LEFTHOOK=1 git push',
  'HUSKY=false git commit -m x',
  'LEFTHOOK=0 LEFTHOOK=1 git push',
  'HUSKY=0 env -u HUSKY git commit -m x',
  'git push --no-verify --verify',
  'git commit -n --veri -m x',
  'LEFTHOOK=0 git status',
  'LEFTHOOK=0 bun run test',
  'git log --no-verify',
  'echo HUSKY=0 git push',
  'LEFTHOOK_EXCLUDE= git push',
  'LEFTHOOK_EXCLUDE=, git push',
  'LEFTHOOK_EXCLUDE=test git status',
  'LEFTHOOK_EXCLUDE=test gh stack view',
  'LEFTHOOK_EXCLUDE=test gh pr create',
  'LEFTHOOK_EXCLUDE=test LEFTHOOK_EXCLUDE= git push',
  'env -u LEFTHOOK_SKIP git push',
  'export LEFTHOOK_EXCLUDE=test && unset LEFTHOOK_EXCLUDE && git push',
  'export LEFTHOOK_EXCLUDE=test && LEFTHOOK_EXCLUDE= git push',
  'git push && export LEFTHOOK_EXCLUDE=test',
  'export LEFTHOOK_EXCLUDE && git push',
  'export LEFTHOOK_EXCLUDE=test; LEFTHOOK_EXCLUDE=; git push',
  'export LEFTHOOK=0 && LEFTHOOK=1 && gh stack push',
])('it finds no hook bypass in %s', (command) => {
  expect(collectHookBypasses(command, '/srv/harbor', null)).toStrictEqual([]);
});
