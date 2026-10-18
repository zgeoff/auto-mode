import { mock } from 'bun:test';
import type { LockClock } from '../src/state/types.ts';

export interface StubLockClockOptions {
  readonly startAt: number;
  readonly advancesOnWait: boolean;
}

export interface StubLockClock extends LockClock {
  readonly wait: ReturnType<typeof mock<(delayMs: number) => Promise<void>>>;
  readonly waited: Promise<void>;
}

// A lock clock whose wait returns at once. It moves the time forward by each wait
// only when told to, so a test of many writers can keep the time still.
export function buildStubLockClock(options: Readonly<StubLockClockOptions>): StubLockClock {
  let now = options.startAt;
  const waited = Promise.withResolvers<void>();

  return {
    now: () => now,
    wait: mock((delayMs: number) => {
      if (options.advancesOnWait) {
        now += delayMs;
      }

      waited.resolve();

      return Promise.resolve();
    }),
    waited: waited.promise,
  };
}
