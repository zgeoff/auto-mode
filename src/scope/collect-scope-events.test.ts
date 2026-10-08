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

test('it collects a branch created by checkout, switch, or branch in the directory', () => {
  expect(
    collectScopeEvents(
      'git checkout -b a; git switch -c b; git switch --create c; git branch d origin/main',
      '/repo',
      '/home/dev',
    ),
  ).toStrictEqual([
    { kind: 'branch', name: 'a', directory: '/repo' },
    { kind: 'branch', name: 'b', directory: '/repo' },
    { kind: 'branch', name: 'c', directory: '/repo' },
    { kind: 'branch', name: 'd', directory: '/repo' },
  ]);
});

test('it collects no branch from a listing, a rename, a deletion, or a plain checkout', () => {
  expect(
    collectScopeEvents(
      'git branch --show-current; git branch -m a b; git branch -D x; git checkout main; git branch -vv',
      '/repo',
      '/home/dev',
    ),
  ).toStrictEqual([]);
});

test('it collects a pull request with its named head or none', () => {
  expect(
    collectScopeEvents(
      'gh pr create --fill; gh pr create --head feat/x --title t --body b',
      '/repo',
      '/home/dev',
    ),
  ).toStrictEqual([
    { kind: 'pull-request', directory: '/repo', head: null },
    { kind: 'pull-request', directory: '/repo', head: 'feat/x' },
  ]);
});

test('it collects nothing it cannot resolve from the command text', () => {
  expect(
    collectScopeEvents(
      'git worktree add "$DIR"; git checkout -b "$NAME"; cd x | cat; git worktree add y',
      '/repo',
      '/home/dev',
    ),
  ).toStrictEqual([]);
});
