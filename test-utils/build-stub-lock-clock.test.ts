import { expect, test } from 'bun:test';
import { buildStubLockClock } from './build-stub-lock-clock.ts';

test('it starts at the given time and moves forward by each wait when told to advance', async () => {
  const clock = buildStubLockClock({ startAt: 1000, advancesOnWait: true });

  await clock.wait(10);
  await clock.wait(25);

  expect(clock.now()).toBe(1035);
});

test('it keeps the time still across waits when told not to advance', async () => {
  const clock = buildStubLockClock({ startAt: 1000, advancesOnWait: false });

  await clock.wait(10);

  expect(clock.now()).toBe(1000);
});

test('it leaves the waited signal unsettled before the first wait', () => {
  const clock = buildStubLockClock({ startAt: 1000, advancesOnWait: false });

  expect(Bun.peek.status(clock.waited)).toBe('pending');
});

test('it settles the waited signal at the first wait', async () => {
  const clock = buildStubLockClock({ startAt: 1000, advancesOnWait: false });

  await clock.wait(10);

  expect(clock.waited).resolves.toBeUndefined();
});
