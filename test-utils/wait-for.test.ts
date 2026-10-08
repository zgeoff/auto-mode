import { expect, mock, test } from 'bun:test';
import { waitFor } from './wait-for.ts';

test('it returns the first value that meets the condition without waiting', async () => {
  const read = mock(() => 'ready');

  const value = await waitFor(read, (current) => current === 'ready');

  expect(value).toBe('ready');
  expect(read).toHaveBeenCalledOnce();
});

test('it reads again until the condition holds', async () => {
  const values = ['R', 'R', 'Z'];
  const read = mock(() => values.shift());

  const value = await waitFor(read, (current) => current === 'Z', { intervalMs: 1 });

  expect(value).toBe('Z');
  expect(read).toHaveBeenCalledTimes(3);
});

test('it throws with the last value when the condition never holds before the deadline', () => {
  expect(
    waitFor(
      () => 'R',
      (current) => current === 'Z',
      { timeoutMs: 20, intervalMs: 1 },
    ),
  ).rejects.toThrowWithMessage(Error, 'condition not met within 20ms; last value: "R"');
});

test('it waits on a read that resolves asynchronously', async () => {
  const values = ['R', 'Z'];
  const read = mock(() => Promise.resolve(values.shift()));

  const value = await waitFor(read, (current) => current === 'Z', { intervalMs: 1 });

  expect(value).toBe('Z');
  expect(read).toHaveBeenCalledTimes(2);
});

test('it lets an error from the read escape without reading again', () => {
  const read = mock(() => {
    throw new Error('unreadable process stat');
  });

  expect(waitFor(read, () => false, { intervalMs: 1 })).rejects.toThrowWithMessage(
    Error,
    'unreadable process stat',
  );

  expect(read).toHaveBeenCalledOnce();
});
