import { expect, test } from 'bun:test';
import { collectHookBypasses } from './collect-hook-bypasses.ts';

test.each([
  ['LEFTHOOK=0 git push', ['LEFTHOOK=0']],
  ['LEFTHOOK=false git commit -m wip', ['LEFTHOOK=false']],
  ['HUSKY=0 git commit -m x', ['HUSKY=0']],
  ['env HUSKY=0 git push origin feat/a', ['HUSKY=0']],
  ['CI=1 LEFTHOOK=0 /usr/bin/git -C /repo push', ['LEFTHOOK=0']],
  ['git commit --no-verify -m x', ['--no-verify']],
  ['git commit --no-veri -m x', ['--no-veri']],
  ['git push --no-verify', ['--no-verify']],
  ['git commit -n -m x', ['-n']],
  ['git commit -anm x', ['-anm']],
  ['git add . && LEFTHOOK=0 git commit -nm x', ['LEFTHOOK=0', '-nm']],
  ['git push --verify --no-verify', ['--no-verify']],
  ['git commit -nm --verify', ['-nm']],
  ['LEFTHOOK=1 LEFTHOOK=0 git push', ['LEFTHOOK=0']],
  ['env -u HUSKY HUSKY=0 git commit -m x', ['HUSKY=0']],
])('it finds the hook bypass in %s', (command, expected) => {
  expect(collectHookBypasses(command)).toStrictEqual(expected);
});

test.each([
  'git push',
  'git commit -m x',
  'git push -n origin feat/a',
  'git commit -m -n',
  'git commit -mnote',
  'git commit --message --no-verify',
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
])('it finds no hook bypass in %s', (command) => {
  expect(collectHookBypasses(command)).toStrictEqual([]);
});
