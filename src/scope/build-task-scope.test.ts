import { expect, test } from 'bun:test';
import { buildMockScopeFacts } from '../../test-utils/factories/build-mock-scope-facts.ts';
import { buildTaskScope } from './build-task-scope.ts';

test('it unites the facts of every source and drops the default branch any source names', () => {
  expect(
    buildTaskScope({
      home: '/home/dev',
      currentBranch: 'feat/a',
      defaultBranch: 'main',
      remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
      facts: [
        buildMockScopeFacts({ worktrees: ['/repo/.worktrees/a'], branches: ['feat/a'] }),
        buildMockScopeFacts({
          worktrees: ['/repo/.worktrees/b', '/repo/.worktrees/a'],
          branches: ['feat/b', 'main'],
          pullRequests: [{ number: 4, head: 'feat/b', repository: 'github.com/dev/app' }],
        }),
        buildMockScopeFacts({ pathGlobs: ['/scratch/**'] }),
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
      buildMockScopeFacts({ worktrees: ['/repo'], branches: ['master', 'develop', 'feat/x'] }),
    ],
  });

  expect(scope).toStrictEqual({
    home: '/home/dev',
    worktrees: ['/repo'],
    branches: ['feat/x'],
    currentBranch: 'master',
    remotes: [],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it owns no PR whose head branch is outside the scope or whose repository is another', () => {
  const scope = buildTaskScope({
    home: '/home/dev',
    currentBranch: 'feat/a',
    defaultBranch: 'main',
    remotes: [{ name: 'origin', url: 'https://github.com/dev/app.git' }],
    facts: [
      buildMockScopeFacts({
        worktrees: ['/repo'],
        branches: ['feat/a'],
        pullRequests: [
          { number: 1, head: 'feat/other', repository: 'github.com/dev/app' },
          { number: 2, head: 'feat/a', repository: 'github.com/someone/app' },
          { number: 3, head: 'main', repository: 'github.com/dev/app' },
        ],
      }),
    ],
  });

  expect(scope).toStrictEqual({
    home: '/home/dev',
    worktrees: ['/repo'],
    branches: ['feat/a'],
    currentBranch: 'feat/a',
    remotes: [{ name: 'origin', url: 'https://github.com/dev/app.git' }],
    pullRequests: [],
    pathGlobs: [],
  });
});

test('it keeps a PR whose repository a checkout remote names', () => {
  const scope = buildTaskScope({
    home: '/home/dev',
    currentBranch: 'main',
    defaultBranch: 'main',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    facts: [
      buildMockScopeFacts({
        worktrees: ['/repo/.worktrees/feat'],
        branches: ['feat'],
        pullRequests: [
          { number: 12, head: 'feat', repository: 'github.com/dev/app' },
          { number: 4, head: 'feat', repository: 'git.example.com/team/lib' },
        ],
      }),
    ],
  });

  expect(scope).toStrictEqual({
    home: '/home/dev',
    worktrees: ['/repo/.worktrees/feat'],
    branches: ['feat'],
    currentBranch: 'main',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    pullRequests: [{ number: 12, repository: 'github.com/dev/app' }],
    pathGlobs: [],
  });
});
