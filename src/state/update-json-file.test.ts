import { expect, onTestFinished, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as z from 'zod';
import { buildStubLockClock } from '../../test-utils/build-stub-lock-clock.ts';
import { loadJSONFile } from './load-json-file.ts';
import { updateJSONFile } from './update-json-file.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-update-json-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const path = join(dir, 'state', 'session.json');

  return {
    path,
    lock: `${path}.lock`,
    load: (file: string) => loadJSONFile(file, z.strictObject({ count: z.number() }), { count: 0 }),
  };
}

test('it writes the updated value as one JSON line and returns it beside the value it read', async () => {
  const ctx = await setupTest();

  await mkdir(dirname(ctx.path));
  await writeFile(ctx.path, '{"count":2}\n');

  const updated = await updateJSONFile(ctx.path, ctx.load, (current) => ({
    count: current.count + 1,
  }));

  const text = await readFile(ctx.path, 'utf8');

  expect(updated).toStrictEqual({ previous: { count: 2 }, next: { count: 3 } });
  expect(text).toBe('{"count":3}\n');
});

test('it writes nothing when the update returns the value it read', async () => {
  const ctx = await setupTest();

  await updateJSONFile(ctx.path, ctx.load, (current) => current);

  const entries = await readdir(dirname(ctx.path));

  expect(entries).toStrictEqual([]);
});

test('it keeps every update when many run at once', async () => {
  const ctx = await setupTest();

  await Promise.all(
    Array.from({ length: 8 }, () =>
      updateJSONFile(ctx.path, ctx.load, (current) => ({ count: current.count + 1 })),
    ),
  );

  const loaded = await ctx.load(ctx.path);

  expect(loaded).toStrictEqual({ count: 8 });
});

test('it never removes a lock younger than the stale age', async () => {
  const ctx = await setupTest();

  const lockedAt = Date.parse('2026-01-01T00:00:00Z');

  await mkdir(dirname(ctx.path));
  await writeFile(ctx.lock, 'held by another update\n');
  await utimes(ctx.lock, new Date(lockedAt), new Date(lockedAt));

  const clock = buildStubLockClock({ startAt: lockedAt + 6990, advancesOnWait: true });

  expect(
    updateJSONFile(ctx.path, ctx.load, () => ({ count: 1 }), clock),
  ).rejects.toThrowWithMessage(Error, 'state file lock unavailable');

  const lockContent = await readFile(ctx.lock, 'utf8');
  const loaded = await ctx.load(ctx.path);

  expect(clock.now()).toBe(lockedAt + 10_000);
  expect(lockContent).toBe('held by another update\n');
  expect(loaded).toStrictEqual({ count: 0 });
});

test('it gives up on a held lock once it has waited 3 s', async () => {
  const ctx = await setupTest();

  const lockedAt = Date.parse('2026-01-01T00:00:00Z');

  await mkdir(dirname(ctx.path));
  await writeFile(ctx.lock, 'held by another update\n');
  await utimes(ctx.lock, new Date(lockedAt), new Date(lockedAt));

  const clock = buildStubLockClock({ startAt: lockedAt, advancesOnWait: true });

  expect(
    updateJSONFile(ctx.path, ctx.load, () => ({ count: 1 }), clock),
  ).rejects.toThrowWithMessage(Error, 'state file lock unavailable');

  expect(clock.now()).toBe(lockedAt + 3010);
});

test('it removes a lock older than the stale age and writes the update', async () => {
  const ctx = await setupTest();

  const lockedAt = Date.parse('2026-01-01T00:00:00Z');

  await mkdir(dirname(ctx.path));
  await writeFile(ctx.lock, 'held by another update\n');
  await utimes(ctx.lock, new Date(lockedAt), new Date(lockedAt));

  const stub = buildStubLockClock({ startAt: lockedAt + 10_001, advancesOnWait: true });
  const locksSeen: string[] = [];

  await updateJSONFile(ctx.path, ctx.load, () => ({ count: 1 }), {
    now: () => {
      locksSeen.push(readFileSync(ctx.lock, 'utf8'));

      return stub.now();
    },
    wait: stub.wait,
  });

  const loaded = await ctx.load(ctx.path);

  expect(locksSeen.at(-1)).toBe('held by another update\n');
  expect(stub.wait).not.toHaveBeenCalled();
  expect(loaded).toStrictEqual({ count: 1 });
  expect(stat(ctx.lock)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('it writes the file readable by its owner alone', async () => {
  const ctx = await setupTest();

  await updateJSONFile(ctx.path, ctx.load, () => ({ count: 1 }));

  const file = await stat(ctx.path);

  expect(file.mode & 0o777).toBe(0o600);
});

test('it creates the directory open to its owner alone', async () => {
  const ctx = await setupTest();

  await updateJSONFile(ctx.path, ctx.load, () => ({ count: 1 }));

  const directory = await stat(dirname(ctx.path));

  expect(directory.mode & 0o777).toBe(0o700);
});

test('it leaves no lock or staged file behind after writing', async () => {
  const ctx = await setupTest();

  await updateJSONFile(ctx.path, ctx.load, () => ({ count: 1 }));

  const entries = await readdir(dirname(ctx.path));

  expect(entries).toStrictEqual(['session.json']);
});
