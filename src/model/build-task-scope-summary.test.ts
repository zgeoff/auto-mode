import { expect, test } from 'bun:test';
import { buildMockOwnedScope } from '../../test-utils/factories/build-mock-owned-scope.ts';
import { buildTaskScopeSummary } from './build-task-scope-summary.ts';

test('it keeps the owned worktrees, branches and pull requests and leaves out the rest of the scope', () => {
  const scope = buildMockOwnedScope({
    home: '/home/dev',
    worktrees: ['/home/dev/app'],
    branches: ['feat/a'],
    currentBranch: 'feat/a',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    pullRequests: [{ repository: 'github.com/dev/app', number: 12 }],
    pathGlobs: ['/home/dev/scratch/**'],
  });

  expect(buildTaskScopeSummary(scope)).toStrictEqual({
    worktrees: ['/home/dev/app'],
    branches: ['feat/a'],
    pullRequests: [{ repository: 'github.com/dev/app', number: 12 }],
  });
});

test('it keeps only the repository and number of each pull request', () => {
  const pull = { repository: 'github.com/dev/app', number: 12, head: 'feat/a' };

  const summary = buildTaskScopeSummary(
    buildMockOwnedScope({ worktrees: [], branches: [], pullRequests: [pull] }),
  );

  expect(summary.pullRequests).toStrictEqual([{ repository: 'github.com/dev/app', number: 12 }]);
});

test('it summarises a scope that owns nothing as empty lists', () => {
  const scope = buildMockOwnedScope({ worktrees: [], branches: [], pullRequests: [] });

  expect(buildTaskScopeSummary(scope)).toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
  });
});
