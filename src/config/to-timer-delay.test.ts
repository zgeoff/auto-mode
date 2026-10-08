import { expect, test } from 'bun:test';
import { toTimerDelay } from './to-timer-delay.ts';

test.each([
  [1000, 1000],
  [1000.5, 1001],
  [0.2, 1],
])('it turns a %p ms timeout into a %p ms timer delay', (ms, delay) => {
  expect(toTimerDelay(ms)).toBe(delay);
});

test('it gives AbortSignal.timeout a delay it accepts for a fractional timeout', () => {
  expect(() => AbortSignal.timeout(toTimerDelay(1000.5))).not.toThrow();
});
