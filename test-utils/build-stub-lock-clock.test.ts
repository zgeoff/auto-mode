import { expect, test } from 'bun:test';
import { buildStubLockClock } from './build-stub-lock-clock.ts';

test('it starts at the given time and moves forward by each wait when told to advance', async () => {
  const clock = buildStubLockClock({ startAt: 1000, advancesOnWait: true });

  await clock.wait(10);
  await clock.wait(25);

  expect(clock.now()).toBe(1035);
  expect(clock.wait).toHaveBeenNthCalledWith(1, 10);
  expect(clock.wait).toHaveBeenNthCalledWith(2, 25);
});

test('it keeps the time still across waits when told not to advance', async () => {
  const clock = buildStubLockClock({ startAt: 1000, advancesOnWait: false });

  await clock.wait(10);

  expect(clock.now()).toBe(1000);
  expect(clock.wait).toHaveBeenCalledExactlyOnceWith(10);
});

test('it settles the waited signal at the first wait', async () => {
  const clock = buildStubLockClock({ startAt: 1000, advancesOnWait: false });

  await clock.wait(10);

  expect(clock.waited).resolves.toBeUndefined();
});
