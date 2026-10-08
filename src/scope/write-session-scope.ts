import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as waitFor } from 'node:timers/promises';
import { loadSessionScope } from './load-session-scope.ts';
import { mergeSessionScope } from './merge-session-scope.ts';
import type { SessionScope } from './types.ts';

export interface LockClock {
  readonly now: () => number;
  readonly wait: (ms: number) => Promise<void>;
}

const SYSTEM_CLOCK: LockClock = { now: Date.now, wait: (ms) => waitFor(ms) };

// Subagents of one session record in parallel CLI processes, so the
// read-merge-write runs under a lock file beside the scope file.
export async function writeSessionScope(
  path: string,
  added: Readonly<SessionScope>,
  clock: Readonly<LockClock> = SYSTEM_CLOCK,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  const lock = `${path}.lock`;

  await claimLock(lock, clock);

  try {
    const merged = mergeSessionScope([await loadSessionScope(path), added]);
    const staged = `${path}.${randomUUID()}.tmp`;

    await writeFile(staged, `${JSON.stringify(merged)}\n`, { mode: 0o600 });
    await rename(staged, path);
  } finally {
    await rm(lock, { force: true });
  }
}

// A record finishes in milliseconds; a lock older than this belongs to a
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
      throw new Error('session scope lock unavailable');
    } else {
      await clock.wait(LOCK_POLL_MS);
    }
  }
}
