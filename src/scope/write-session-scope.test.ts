import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildStubLockClock } from '../../test-utils/build-stub-lock-clock.ts';
import { buildMockSessionScope } from '../../test-utils/factories/build-mock-session-scope.ts';
import { loadSessionScope } from './load-session-scope.ts';
import { writeSessionScope } from './write-session-scope.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-session-scope-'));

  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const path = join(dir, 'session-scope', 'session.json');

  return { path, lock: `${path}.lock` };
}

test('it never removes a lock younger than the stale age', async () => {
  const ctx = await setupTest();

  const lockedAt = Date.parse('2026-01-01T00:00:00Z');

  await mkdir(dirname(ctx.path));
  await writeFile(ctx.lock, 'held by another record\n');
  await utimes(ctx.lock, new Date(lockedAt), new Date(lockedAt));

  const clock = buildStubLockClock({ startAt: lockedAt + 6990, advancesOnWait: true });

  expect(
    writeSessionScope(
      ctx.path,
      buildMockSessionScope({
        worktrees: ['/work/app/.worktrees/x'],
        branches: [{ name: 'feat/x', commonDir: '/work/app/.git' }],
        pullRequests: [],
      }),
      clock,
    ),
  ).rejects.toThrowWithMessage(Error, 'session scope lock unavailable');

  const lockContent = await readFile(ctx.lock, 'utf8');
  const scope = await loadSessionScope(ctx.path);

  expect(clock.now()).toBe(lockedAt + 10_000);
  expect(lockContent).toBe('held by another record\n');
  expect(scope).toStrictEqual({ worktrees: [], branches: [], pullRequests: [] });
});

test('it gives up on a held lock once it has waited 3 s', async () => {
  const ctx = await setupTest();

  const lockedAt = Date.parse('2026-01-01T00:00:00Z');

  await mkdir(dirname(ctx.path));
  await writeFile(ctx.lock, 'held by another record\n');
  await utimes(ctx.lock, new Date(lockedAt), new Date(lockedAt));

  const clock = buildStubLockClock({ startAt: lockedAt, advancesOnWait: true });

  expect(
    writeSessionScope(
      ctx.path,
      buildMockSessionScope({
        worktrees: ['/work/app/.worktrees/x'],
        branches: [{ name: 'feat/x', commonDir: '/work/app/.git' }],
        pullRequests: [],
      }),
      clock,
    ),
  ).rejects.toThrowWithMessage(Error, 'session scope lock unavailable');

  expect(clock.now()).toBe(lockedAt + 3010);
});

test('it removes a lock older than the stale age and records the scope', async () => {
  const ctx = await setupTest();

  const lockedAt = Date.parse('2026-01-01T00:00:00Z');

  await mkdir(dirname(ctx.path));
  await writeFile(ctx.lock, 'held by another record\n');
  await utimes(ctx.lock, new Date(lockedAt), new Date(lockedAt));

  const staleLock = await readFile(ctx.lock, 'utf8');

  const clock = buildStubLockClock({ startAt: lockedAt + 10_001, advancesOnWait: true });

  await writeSessionScope(
    ctx.path,
    buildMockSessionScope({
      worktrees: ['/work/app/.worktrees/x'],
      branches: [{ name: 'feat/x', commonDir: '/work/app/.git' }],
      pullRequests: [],
    }),
    clock,
  );

  const scope = await loadSessionScope(ctx.path);

  expect(staleLock).toBe('held by another record\n');
  expect(clock.wait).not.toHaveBeenCalled();

  expect(scope).toStrictEqual({
    worktrees: ['/work/app/.worktrees/x'],
    branches: [{ name: 'feat/x', commonDir: '/work/app/.git' }],
    pullRequests: [],
  });

  expect(stat(ctx.lock)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('it merges the added scope into the scope already written', async () => {
  const ctx = await setupTest();

  await mkdir(dirname(ctx.path));

  await writeFile(
    ctx.path,
    JSON.stringify(
      buildMockSessionScope({
        worktrees: ['/work/app/.worktrees/x'],
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

test('it writes the scope file readable by its owner alone', async () => {
  const ctx = await setupTest();

  await writeSessionScope(
    ctx.path,
    buildMockSessionScope({ worktrees: ['/work/app/.worktrees/x'] }),
  );

  const file = await stat(ctx.path);

  expect(file.mode & 0o777).toBe(0o600);
});

test('it leaves no lock or staged file behind after writing', async () => {
  const ctx = await setupTest();

  await writeSessionScope(
    ctx.path,
    buildMockSessionScope({ worktrees: ['/work/app/.worktrees/x'] }),
  );

  const entries = await readdir(dirname(ctx.path));

  expect(entries).toStrictEqual(['session.json']);
});

test('it creates the scope directory readable by its owner alone', async () => {
  const ctx = await setupTest();

  await writeSessionScope(
    ctx.path,
    buildMockSessionScope({ worktrees: ['/work/app/.worktrees/x'] }),
  );

  const directory = await stat(dirname(ctx.path));

  expect(directory.mode & 0o777).toBe(0o700);
});
