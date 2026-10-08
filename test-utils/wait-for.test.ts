import { expect, mock, test } from 'bun:test';
import { buildStubLockClock } from './build-stub-lock-clock.ts';
import { waitFor } from './wait-for.ts';

test('it returns the first value that meets the condition without waiting', async () => {
  const read = mock(() => 'ready');
  const clock = buildStubLockClock({ startAt: 0, advancesOnWait: true });

  const value = await waitFor(read, (current) => current === 'ready', { clock });

  expect(value).toBe('ready');
  expect(read).toHaveBeenCalledOnce();
  expect(clock.wait).not.toHaveBeenCalled();
});

test('it reads again after each interval until the condition holds', async () => {
  const values = ['R', 'R', 'Z'];
  const read = mock(() => values.shift());
  const clock = buildStubLockClock({ startAt: 0, advancesOnWait: true });

  const value = await waitFor(read, (current) => current === 'Z', { intervalMs: 5, clock });

  expect(value).toBe('Z');
  expect(read).toHaveBeenCalledTimes(3);
  expect(clock.wait.mock.calls).toStrictEqual([[5], [5]]);
});

test('it throws with the last value once the deadline passes', () => {
  const read = mock(() => 'R');
  const clock = buildStubLockClock({ startAt: 1000, advancesOnWait: true });

  expect(
    waitFor(read, (current) => current === 'Z', { timeoutMs: 20, intervalMs: 5, clock }),
  ).rejects.toThrowWithMessage(Error, 'condition not met within 20ms; last value: "R"');

  expect(read).toHaveBeenCalledTimes(5);
});

test('it waits on a read that resolves asynchronously', async () => {
  const values = ['R', 'Z'];
  const read = mock(() => Promise.resolve(values.shift()));
  const clock = buildStubLockClock({ startAt: 0, advancesOnWait: true });

  const value = await waitFor(read, (current) => current === 'Z', { intervalMs: 5, clock });

  expect(value).toBe('Z');
  expect(read).toHaveBeenCalledTimes(2);
});

test('it lets an error from the read escape without reading again', () => {
  const read = mock(() => {
    throw new Error('unreadable process stat');
  });

  const clock = buildStubLockClock({ startAt: 0, advancesOnWait: true });

  expect(waitFor(read, () => false, { clock })).rejects.toThrowWithMessage(
    Error,
    'unreadable process stat',
  );

  expect(read).toHaveBeenCalledOnce();
});

test('it reads again on the real clock when given none', async () => {
  const values = ['R', 'Z'];
  const read = mock(() => values.shift());

  const value = await waitFor(read, (current) => current === 'Z', { intervalMs: 1 });

  expect(value).toBe('Z');
  expect(read).toHaveBeenCalledTimes(2);
});
