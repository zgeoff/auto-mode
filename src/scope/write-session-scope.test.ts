import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildMockSessionScope } from '../../test-utils/factories/build-mock-session-scope.ts';
import { loadSessionScope } from './load-session-scope.ts';
import { writeSessionScope } from './write-session-scope.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-session-scope-'));

  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  return { path: join(directory, 'session-scope', 'session.json') };
}

test('it merges the added scope into the scope already written', async () => {
  const ctx = await setupTest();

  await mkdir(dirname(ctx.path));

  await writeFile(
    ctx.path,
    JSON.stringify(
      buildMockSessionScope({
        worktrees: ['/work/app/.worktrees/x'],
        branches: [],
        pullRequests: [{ number: 3, head: 'feat/x', repository: 'github.com/dev/app' }],
      }),
    ),
  );

  await writeSessionScope(
    ctx.path,
    buildMockSessionScope({
      worktrees: ['/work/app/.worktrees/y'],
      branches: [{ name: 'feat/y', commonDir: '/work/app/.git' }],
      pullRequests: [],
    }),
  );

  const scope = await loadSessionScope(ctx.path);

  expect(scope).toStrictEqual({
    worktrees: ['/work/app/.worktrees/x', '/work/app/.worktrees/y'],
    branches: [{ name: 'feat/y', commonDir: '/work/app/.git' }],
    pullRequests: [{ number: 3, head: 'feat/x', repository: 'github.com/dev/app' }],
  });
});

test('it keeps both scopes when two records of one session write at once', async () => {
  const ctx = await setupTest();

  await Promise.all([
    writeSessionScope(ctx.path, buildMockSessionScope({ worktrees: ['/work/app/.worktrees/x'] })),
    writeSessionScope(ctx.path, buildMockSessionScope({ worktrees: ['/work/app/.worktrees/y'] })),
  ]);

  const scope = await loadSessionScope(ctx.path);

  expect(scope.worktrees).toIncludeSameMembers([
    '/work/app/.worktrees/x',
    '/work/app/.worktrees/y',
  ]);
});
