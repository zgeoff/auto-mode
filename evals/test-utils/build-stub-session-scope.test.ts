import { expect, test } from 'bun:test';
import { buildStubSessionScope } from './build-stub-session-scope.ts';

test('it confirms a worktree with the branch the recording names for it', () => {
  expect(
    buildStubSessionScope({ kind: 'worktree', path: '/home/dev/app/.worktrees/fix' }, '', {
      commonDir: '/home/dev/app/.git',
      worktreeBranches: { '/home/dev/app/.worktrees/fix': 'fix/a' },
      pullRequestHeads: {},
    }),
  ).toStrictEqual({
    worktrees: ['/home/dev/app/.worktrees/fix'],
    branches: [{ name: 'fix/a', commonDir: '/home/dev/app/.git' }],
    pullRequests: [],
  });
});

test('it confirms a worktree without a branch when the recording names none', () => {
  expect(
    buildStubSessionScope({ kind: 'worktree', path: '/home/dev/app/.worktrees/fix' }, '', {
      commonDir: '/home/dev/app/.git',
      worktreeBranches: {},
      pullRequestHeads: {},
    }),
  ).toStrictEqual({ worktrees: ['/home/dev/app/.worktrees/fix'], branches: [], pullRequests: [] });
});

test('it confirms a created branch in the recorded repository', () => {
  expect(
    buildStubSessionScope({ kind: 'branch', name: 'feat/b', directory: '/home/dev/app' }, '', {
      commonDir: '/home/dev/app/.git',
      worktreeBranches: {},
      pullRequestHeads: {},
    }),
  ).toStrictEqual({
    worktrees: [],
    branches: [{ name: 'feat/b', commonDir: '/home/dev/app/.git' }],
    pullRequests: [],
  });
});

test('it confirms the first PR the call printed with the head the recording names', () => {
  expect(
    buildStubSessionScope(
      { kind: 'pull-request', directory: '/home/dev/app', head: null },
      'https://github.com/dev/app/pull/7\nhttps://github.com/dev/app/pull/8',
      {
        commonDir: '/home/dev/app/.git',
        worktreeBranches: {},
        pullRequestHeads: { '7': 'feat/b', '8': 'feat/c' },
      },
    ),
  ).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [{ repository: 'github.com/dev/app', number: 7, head: 'feat/b' }],
  });
});

test('it confirms no PR when the recording names no head for it', () => {
  expect(
    buildStubSessionScope(
      { kind: 'pull-request', directory: '/home/dev/app', head: null },
      'https://github.com/dev/app/pull/7',
      { commonDir: '/home/dev/app/.git', worktreeBranches: {}, pullRequestHeads: {} },
    ),
  ).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it confirms no PR when the call printed none', () => {
  expect(
    buildStubSessionScope(
      { kind: 'pull-request', directory: '/home/dev/app', head: null },
      'error: no commits',
      {
        commonDir: '/home/dev/app/.git',
        worktreeBranches: {},
        pullRequestHeads: { '7': 'feat/b' },
      },
    ),
  ).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});
