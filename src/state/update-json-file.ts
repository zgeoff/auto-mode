import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
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

  await claimLock(lock, clock);

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
    await rm(lock, { force: true });
  }
}

// An update finishes in milliseconds; a lock older than this belongs to a
// process that died holding it.
const STALE_LOCK_MS = 10_000;
const LOCK_WAIT_MS = 3000;
const LOCK_POLL_MS = 10;

async function claimLock(lock: string, clock: Readonly<LockClock>): Promise<void> {
  const deadline = clock.now() + LOCK_WAIT_MS;

  for (;;) {
    try {
      const handle = await open(lock, 'wx', 0o600);

      await handle.close();

      return;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        throw error;
      }
    }

    const held = await stat(lock).catch(() => null);

    if (held !== null && clock.now() - held.mtimeMs > STALE_LOCK_MS) {
      await rm(lock, { force: true });
    } else if (clock.now() > deadline) {
      throw new Error('state file lock unavailable');
    } else {
      await clock.wait(LOCK_POLL_MS);
    }
  }
}
