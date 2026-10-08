import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSessionScope } from './load-session-scope.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-load-session-scope-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { path: join(dir, 'session.json') };
}

test('it loads the scope a session has recorded', async () => {
  const ctx = await setupTest();

  const recorded = {
    worktrees: ['/home/dev/app/.worktrees/x'],
    branches: [{ name: 'feat/x', commonDir: '/home/dev/app/.git' }],
    pullRequests: [{ number: 12, head: 'feat/x', repository: 'github.com/dev/app' }],
  };

  await writeFile(ctx.path, JSON.stringify(recorded));

  expect(loadSessionScope(ctx.path)).resolves.toStrictEqual(recorded);
});

test('it loads an empty scope for a session that has recorded nothing yet', async () => {
  const ctx = await setupTest();

  expect(loadSessionScope(ctx.path)).resolves.toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
  });
});

test('it loads an empty scope from a path it cannot read as a file', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.path);

  expect(loadSessionScope(ctx.path)).resolves.toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
  });
});

test('it loads an empty scope from a file that is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, '{"worktrees": [');

  expect(loadSessionScope(ctx.path)).resolves.toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
  });
});

test.each([
  [
    'an empty worktree path',
    {
      worktrees: [''],
      branches: [{ name: 'feat/x', commonDir: '/home/dev/app/.git' }],
      pullRequests: [{ number: 12, head: 'feat/x', repository: 'github.com/dev/app' }],
    },
  ],
  [
    'a branch with an empty name',
    {
      worktrees: ['/home/dev/app/.worktrees/x'],
      branches: [{ name: '', commonDir: '/home/dev/app/.git' }],
      pullRequests: [{ number: 12, head: 'feat/x', repository: 'github.com/dev/app' }],
    },
  ],
  [
    'a branch with no git directory',
    {
      worktrees: ['/home/dev/app/.worktrees/x'],
      branches: [{ name: 'feat/x' }],
      pullRequests: [{ number: 12, head: 'feat/x', repository: 'github.com/dev/app' }],
    },
  ],
  [
    'a branch with an unknown field',
    {
      worktrees: ['/home/dev/app/.worktrees/x'],
      branches: [{ name: 'feat/x', commonDir: '/home/dev/app/.git', remote: 'origin' }],
      pullRequests: [{ number: 12, head: 'feat/x', repository: 'github.com/dev/app' }],
    },
  ],
  [
    'a pull request number that is not whole',
    {
      worktrees: ['/home/dev/app/.worktrees/x'],
      branches: [{ name: 'feat/x', commonDir: '/home/dev/app/.git' }],
      pullRequests: [{ number: 12.5, head: 'feat/x', repository: 'github.com/dev/app' }],
    },
  ],
  [
    'a pull request number below one',
    {
      worktrees: ['/home/dev/app/.worktrees/x'],
      branches: [{ name: 'feat/x', commonDir: '/home/dev/app/.git' }],
      pullRequests: [{ number: 0, head: 'feat/x', repository: 'github.com/dev/app' }],
    },
  ],
  [
    'a pull request with an empty head',
    {
      worktrees: ['/home/dev/app/.worktrees/x'],
      branches: [{ name: 'feat/x', commonDir: '/home/dev/app/.git' }],
      pullRequests: [{ number: 12, head: '', repository: 'github.com/dev/app' }],
    },
  ],
  [
    'a pull request with an empty repository',
    {
      worktrees: ['/home/dev/app/.worktrees/x'],
      branches: [{ name: 'feat/x', commonDir: '/home/dev/app/.git' }],
      pullRequests: [{ number: 12, head: 'feat/x', repository: '' }],
    },
  ],
  [
    'a pull request with an unknown field',
    {
      worktrees: ['/home/dev/app/.worktrees/x'],
      branches: [{ name: 'feat/x', commonDir: '/home/dev/app/.git' }],
      pullRequests: [
        { number: 12, head: 'feat/x', repository: 'github.com/dev/app', title: 'Fix' },
      ],
    },
  ],
  [
    'no worktree list',
    {
      branches: [{ name: 'feat/x', commonDir: '/home/dev/app/.git' }],
      pullRequests: [{ number: 12, head: 'feat/x', repository: 'github.com/dev/app' }],
    },
  ],
  [
    'no branch list',
    {
      worktrees: ['/home/dev/app/.worktrees/x'],
      pullRequests: [{ number: 12, head: 'feat/x', repository: 'github.com/dev/app' }],
    },
  ],
  [
    'no pull request list',
    {
      worktrees: ['/home/dev/app/.worktrees/x'],
      branches: [{ name: 'feat/x', commonDir: '/home/dev/app/.git' }],
    },
  ],
  [
    'an unknown top-level field',
    {
      worktrees: ['/home/dev/app/.worktrees/x'],
      branches: [{ name: 'feat/x', commonDir: '/home/dev/app/.git' }],
      pullRequests: [{ number: 12, head: 'feat/x', repository: 'github.com/dev/app' }],
      pathGlobs: [],
    },
  ],
])('it loads an empty scope from a record with %s', async (_label, recorded) => {
  const ctx = await setupTest();

  await writeFile(ctx.path, JSON.stringify(recorded));

  expect(loadSessionScope(ctx.path)).resolves.toStrictEqual({
    worktrees: [],
    branches: [],
    pullRequests: [],
  });
});
