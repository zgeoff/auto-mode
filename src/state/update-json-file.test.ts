import { expect, onTestFinished, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
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
    dir,
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

test('it takes over a lock older than the stale age and writes the update', async () => {
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

test('it writes its owner id into the lock while it holds it', async () => {
  const ctx = await setupTest();

  const locksSeen: string[] = [];

  await updateJSONFile(
    ctx.path,
    (file) => {
      locksSeen.push(readFileSync(ctx.lock, 'utf8'));

      return ctx.load(file);
    },
    () => ({ count: 1 }),
  );

  expect(locksSeen).toHaveLength(1);
  expect(locksSeen.at(0)).toMatch(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/);
});

test('it never removes a lock that another owner took over while it held it', async () => {
  const ctx = await setupTest();

  await updateJSONFile(ctx.path, ctx.load, () => {
    writeFileSync(ctx.lock, 'held by another update\n');

    return { count: 1 };
  });

  const lockContent = await readFile(ctx.lock, 'utf8');
  const loaded = await ctx.load(ctx.path);

  expect(lockContent).toBe('held by another update\n');
  expect(loaded).toStrictEqual({ count: 1 });
});

test('it lets one process at a time take over a stale lock that two judge stale at once', async () => {
  const ctx = await setupTest();

  const lockedAt = Date.parse('2026-01-01T00:00:00Z');
  const barrierDir = join(ctx.dir, 'barrier');
  const logPath = join(ctx.dir, 'turns.log');

  await mkdir(dirname(ctx.path));
  await mkdir(barrierDir);
  await writeFile(ctx.lock, 'held by another update\n');
  await utimes(ctx.lock, new Date(lockedAt), new Date(lockedAt));

  const contenders = ['a', 'b'].map((label) =>
    Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, '..', '..', 'test-utils', 'run-stub-lock-contender.ts'),
        ctx.path,
        logPath,
        label,
        barrierDir,
        String(lockedAt + 10_001),
        '2',
      ],
      { stderr: 'pipe' },
    ),
  );

  onTestFinished(() => {
    for (const contender of contenders) {
      contender.kill();
    }
  });

  const exitCodes = await Promise.all(contenders.map((contender) => contender.exited));
  const log = await readFile(logPath, 'utf8');
  const loaded = await ctx.load(ctx.path);
  const entries = await readdir(dirname(ctx.path));

  expect(exitCodes).toStrictEqual([0, 0]);

  expect(log).toBeOneOf([
    'enter a\nleave a\nenter b\nleave b\n',
    'enter b\nleave b\nenter a\nleave a\n',
  ]);

  expect(loaded).toStrictEqual({ count: 2 });
  expect(entries).toStrictEqual(['session.json']);
});

test('it takes over a stale lock whose takeover a dead process left unfinished and clears its marker', async () => {
  const ctx = await setupTest();

  const lockedAt = Date.parse('2026-01-01T00:00:00Z');

  await mkdir(dirname(ctx.path));
  await writeFile(ctx.lock, 'held by another update\n');
  await utimes(ctx.lock, new Date(lockedAt), new Date(lockedAt));

  const held = await stat(ctx.lock);

  const marker = `${ctx.lock}.${String(held.ino)}-${String(held.mtimeMs)}-0.takeover`;

  await writeFile(marker, '');
  await utimes(marker, new Date(lockedAt), new Date(lockedAt));

  const clock = buildStubLockClock({ startAt: lockedAt + 10_001, advancesOnWait: true });

  await updateJSONFile(ctx.path, ctx.load, () => ({ count: 1 }), clock);

  const loaded = await ctx.load(ctx.path);
  const entries = await readdir(dirname(ctx.path));

  expect(loaded).toStrictEqual({ count: 1 });
  expect(entries).toStrictEqual(['session.json']);
});

test('it never replaces a stale lock while another process holds its takeover', async () => {
  const ctx = await setupTest();

  const lockedAt = Date.parse('2026-01-01T00:00:00Z');

  await mkdir(dirname(ctx.path));
  await writeFile(ctx.lock, 'held by another update\n');
  await utimes(ctx.lock, new Date(lockedAt), new Date(lockedAt));

  const held = await stat(ctx.lock);

  const marker = `${ctx.lock}.${String(held.ino)}-${String(held.mtimeMs)}-0.takeover`;

  const markedAt = new Date(lockedAt + 9000);

  await writeFile(marker, '');
  await utimes(marker, markedAt, markedAt);

  const clock = buildStubLockClock({ startAt: lockedAt + 10_001, advancesOnWait: true });

  expect(
    updateJSONFile(ctx.path, ctx.load, () => ({ count: 1 }), clock),
  ).rejects.toThrowWithMessage(Error, 'state file lock unavailable');

  const lockContent = await readFile(ctx.lock, 'utf8');
  const loaded = await ctx.load(ctx.path);

  expect(lockContent).toBe('held by another update\n');
  expect(loaded).toStrictEqual({ count: 0 });
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
