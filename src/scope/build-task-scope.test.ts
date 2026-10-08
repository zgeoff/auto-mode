import { expect, test } from 'bun:test';
import { buildTaskScope } from './build-task-scope.ts';

test('it unites the facts of every source and drops the default branch any source names', () => {
  expect(
    buildTaskScope({
      home: '/home/dev',
      currentBranch: 'feat/a',
      defaultBranch: 'main',
      remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
      facts: [
        {
          worktrees: ['/repo/.worktrees/a'],
          branches: ['feat/a'],
          pullRequests: [],
          pathGlobs: [],
        },
        {
          worktrees: ['/repo/.worktrees/b', '/repo/.worktrees/a'],
          branches: ['feat/b', 'main'],
          pullRequests: [{ number: 4, head: 'feat/b', repository: 'github.com/dev/app' }],
          pathGlobs: [],
        },
        { worktrees: [], branches: [], pullRequests: [], pathGlobs: ['/scratch/**'] },
      ],
    }),
  ).toStrictEqual({
    home: '/home/dev',
    worktrees: ['/repo/.worktrees/a', '/repo/.worktrees/b'],
    branches: ['feat/a', 'feat/b'],
    currentBranch: 'feat/a',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    pullRequests: [{ number: 4, repository: 'github.com/dev/app' }],
    pathGlobs: ['/scratch/**'],
  });
});

test('it owns no protected branch name when the default branch is unknown', () => {
  const scope = buildTaskScope({
    home: '/home/dev',
    currentBranch: 'master',
    defaultBranch: null,
    remotes: [],
    facts: [
      {
        worktrees: ['/repo'],
        branches: ['master', 'develop', 'feat/x'],
        pullRequests: [],
        pathGlobs: [],
      },
    ],
  });

  expect(scope.branches).toStrictEqual(['feat/x']);
});

test('it owns no PR whose head branch is outside the scope or whose repository is another', () => {
  const scope = buildTaskScope({
    home: '/home/dev',
    currentBranch: 'feat/a',
    defaultBranch: 'main',
    remotes: [{ name: 'origin', url: 'https://github.com/dev/app.git' }],
    facts: [
      {
        worktrees: ['/repo'],
        branches: ['feat/a'],
        pullRequests: [
          { number: 1, head: 'feat/other', repository: 'github.com/dev/app' },
          { number: 2, head: 'feat/a', repository: 'github.com/someone/app' },
          { number: 3, head: 'main', repository: 'github.com/dev/app' },
        ],
        pathGlobs: [],
      },
    ],
  });

  expect(scope.pullRequests).toStrictEqual([]);
});
