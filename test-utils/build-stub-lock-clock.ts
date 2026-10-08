import { mock } from 'bun:test';
import type { LockClock } from '../src/scope/write-session-scope.ts';

export interface StubLockClockOptions {
  readonly startAt: number;
  readonly advancesOnWait: boolean;
}

export interface StubLockClock extends LockClock {
  readonly wait: ReturnType<typeof mock<(ms: number) => Promise<void>>>;
  readonly waited: Promise<void>;
}

// A lock clock whose wait returns at once. It moves the time forward by each wait
// only when told to, so a test of many writers can keep the time still.
export function buildStubLockClock(options: Readonly<StubLockClockOptions>): StubLockClock {
  let now = options.startAt;
  const waited = Promise.withResolvers<void>();

  return {
    now: () => now,
    wait: mock((ms: number) => {
      if (options.advancesOnWait) {
        now += ms;
      }

      waited.resolve();

      return Promise.resolve();
    }),
    waited: waited.promise,
  };
}
