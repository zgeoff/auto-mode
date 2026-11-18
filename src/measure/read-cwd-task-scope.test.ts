import { expect, test } from 'bun:test';
import { readCwdTaskScope } from './read-cwd-task-scope.ts';

test('it owns the cwd worktree and its branch', async () => {
  const scope = await readCwdTaskScope('/home/dev/app/.worktrees/feat', {
    branch: 'feat/a',
    defaultBranch: 'main',
  });

  expect(scope).toStrictEqual({
    home: '/home/dev',
    worktrees: ['/home/dev/app/.worktrees/feat'],
    branches: ['feat/a'],
    currentBranch: 'feat/a',
    remotes: [{ name: 'origin', url: '' }],
    pullRequests: [],
    pathGlobs: [],
    paths: [],
    replyChannels: [],
  });
});

test('it reads the first two parts of the cwd as the home directory', async () => {
  const scope = await readCwdTaskScope('/Users/dev/app', {
    branch: 'feat/a',
    defaultBranch: 'main',
  });

  expect(scope.home).toBe('/Users/dev');
});

test('it gives the task one remote without a URL', async () => {
  const scope = await readCwdTaskScope('/home/dev/app', {
    branch: 'feat/a',
    defaultBranch: 'main',
  });

  expect(scope.remotes).toStrictEqual([{ name: 'origin', url: '' }]);
});

test('it owns no branch when the cwd checkout is on the default branch', async () => {
  const scope = await readCwdTaskScope('/home/dev/app', { branch: 'main', defaultBranch: 'main' });

  expect(scope.branches).toStrictEqual([]);
});
