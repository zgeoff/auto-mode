import { randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import { link, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as waitFor } from 'node:timers/promises';
import type { LockClock } from './types.ts';

const SYSTEM_CLOCK: LockClock = { now: Date.now, wait: (ms) => waitFor(ms) };

// Parallel CLI processes of one session update the same file, so the
// read-change-write runs under a lock file beside it.
export async function updateJSONFile<T>(
  path: string,
  load: (path: string) => Promise<T>,
  update: (current: T) => T,
  clock: Readonly<LockClock> = SYSTEM_CLOCK,
): Promise<{ readonly previous: T; readonly next: T }> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  const lock = `${path}.lock`;

  const owner = await claimLock(lock, clock);

  try {
    const previous = await load(path);

    const next = update(previous);

    if (next !== previous) {
      const staged = `${path}.${randomUUID()}.tmp`;

      await writeFile(staged, `${JSON.stringify(next)}\n`, { mode: 0o600 });
      await rename(staged, path);
    }

    return { previous, next };
  } finally {
    await removeOwnLock(lock, owner);
  }
}

// An update finishes in milliseconds; a lock older than this belongs to a
// process that died holding it.
const STALE_LOCK_MS = 10_000;
const LOCK_WAIT_MS = 3000;
const LOCK_POLL_MS = 10;

// The lock is staged under a private name and linked into place, so it holds
// its owner id from the moment it exists.
async function claimLock(lock: string, clock: Readonly<LockClock>): Promise<string> {
  const deadline = clock.now() + LOCK_WAIT_MS;
  const owner = randomUUID();
  const staged = `${lock}.${owner}`;

  await writeFile(staged, owner, { flag: 'wx', mode: 0o600 });

  try {
    for (;;) {
      try {
        await link(staged, lock);

        return owner;
      } catch (error) {
        if (!hasErrorCode(error, 'EEXIST')) {
          throw error;
        }
      }

      const held = await stat(lock).catch(() => null);

      if (held === null) {
        continue;
      }

      if (isStale(held, clock)) {
        const tookOver = await claimStaleLock(lock, staged, held, clock);

        if (tookOver) {
          return owner;
        }
      }

      if (clock.now() > deadline) {
        throw new Error('state file lock unavailable');
      }

      await clock.wait(LOCK_POLL_MS);
    }
  } finally {
    await rm(staged, { force: true });
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isStale(file: Readonly<Stats>, clock: Readonly<LockClock>): boolean {
  return clock.now() - file.mtimeMs > STALE_LOCK_MS;
}

// A marker named for the stale lock's inode and mtime admits one process, and
// the rename swaps its lock in without leaving the path empty. A dead taker's
// marker goes stale; the next process claims the next generation instead.
async function claimStaleLock(
  lock: string,
  staged: string,
  held: Readonly<Stats>,
  clock: Readonly<LockClock>,
): Promise<boolean> {
  const prefix = `${lock}.${String(held.ino)}-${String(held.mtimeMs)}`;

  const generation = await claimTakeoverMarker(prefix, clock);

  if (generation === null) {
    return false;
  }

  try {
    const current = await stat(lock).catch(() => null);

    if (current?.ino !== held.ino || current.mtimeMs !== held.mtimeMs) {
      return false;
    }

    await rename(staged, lock);

    return true;
  } finally {
    await Promise.all(
      Array.from({ length: generation + 1 }, (_, index) =>
        rm(buildTakeoverMarkerPath(prefix, index), { force: true }),
      ),
    );
  }
}

async function claimTakeoverMarker(
  prefix: string,
  clock: Readonly<LockClock>,
): Promise<number | null> {
  for (let generation = 0; ; generation += 1) {
    const marker = buildTakeoverMarkerPath(prefix, generation);

    try {
      await writeFile(marker, '', { flag: 'wx', mode: 0o600 });

      return generation;
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) {
        throw error;
      }
    }

    const existing = await stat(marker).catch(() => null);

    if (existing === null || !isStale(existing, clock)) {
      return null;
    }
  }
}

function buildTakeoverMarkerPath(prefix: string, generation: number): string {
  return `${prefix}-${String(generation)}.takeover`;
}

async function removeOwnLock(lock: string, owner: string): Promise<void> {
  const holder = await readFile(lock, 'utf8').catch(() => null);

  if (holder === owner) {
    await rm(lock, { force: true });
  }
}
