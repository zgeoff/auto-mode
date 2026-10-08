import { expect, test } from 'bun:test';
import { collectScopeEvents } from './collect-scope-events.ts';

test('it collects a worktree added with a new branch, relative to the cwd', () => {
  expect(
    collectScopeEvents('git worktree add .worktrees/fix -b fix origin/main', '/repo', '/home/dev'),
  ).toStrictEqual([{ kind: 'worktree', path: '/repo/.worktrees/fix' }]);
});

test('it follows a cd and git -C before resolving the worktree path', () => {
  expect(
    collectScopeEvents(
      'cd /repo && git -C ../other worktree add --detach ~/wt/x HEAD',
      '/somewhere',
      '/home/dev',
    ),
  ).toStrictEqual([{ kind: 'worktree', path: '/home/dev/wt/x' }]);
});

test.each([
  ['git checkout -b a', 'a'],
  ['git switch -c b', 'b'],
  ['git switch --create c', 'c'],
  ['git branch d origin/main', 'd'],
])('it collects a branch created by %s in the directory', (command, name) => {
  expect(collectScopeEvents(command, '/repo', '/home/dev')).toStrictEqual([
    { kind: 'branch', name, directory: '/repo' },
  ]);
});

test('it collects an event from each command of a compound command, in command order', () => {
  expect(
    collectScopeEvents('git checkout -b a; gh pr create --fill', '/repo', '/home/dev'),
  ).toStrictEqual([
    { kind: 'branch', name: 'a', directory: '/repo' },
    { kind: 'pull-request', directory: '/repo', head: null },
  ]);
});

test.each([
  ['a listing of the current branch', 'git branch --show-current'],
  ['a rename', 'git branch -m a b'],
  ['a deletion', 'git branch -D x'],
  ['a plain checkout', 'git checkout main'],
  ['a verbose listing', 'git branch -vv'],
])('it collects no branch from %s', (_label, command) => {
  expect(collectScopeEvents(command, '/repo', '/home/dev')).toStrictEqual([]);
});

test.each([
  ['no head', 'gh pr create --fill', null],
  ['its named head', 'gh pr create --head feat/x --title t --body b', 'feat/x'],
])('it collects a pull request with %s', (_label, command, head) => {
  expect(collectScopeEvents(command, '/repo', '/home/dev')).toStrictEqual([
    { kind: 'pull-request', directory: '/repo', head },
  ]);
});

test.each([
  ['a worktree path held in a variable', 'git worktree add "$DIR"'],
  ['a branch name held in a variable', 'git checkout -b "$NAME"'],
  ['a worktree added after a cd inside a pipeline', 'cd x | cat; git worktree add y'],
])('it collects nothing from %s', (_label, command) => {
  expect(collectScopeEvents(command, '/repo', '/home/dev')).toStrictEqual([]);
});
