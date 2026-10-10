import { expect, test } from 'bun:test';
import { buildClopperPearsonInterval } from './build-clopper-pearson-interval.ts';

test.each([
  [1, 10, 0.0025, 0.445],
  [5, 10, 0.1871, 0.8129],
  [2, 26, 0.0095, 0.2513],
])(
  'it bounds %d events in %d trials by the published exact 95%% interval',
  (events, total, lower, upper) => {
    const interval = buildClopperPearsonInterval(events, total);

    expect(interval.lower).toBeCloseTo(lower, 4);
    expect(interval.upper).toBeCloseTo(upper, 4);
  },
);

test('it bounds zero events below by zero and above by one minus the 2.5% root', () => {
  const interval = buildClopperPearsonInterval(0, 10);

  expect(interval.lower).toBe(0);
  expect(interval.upper).toBeCloseTo(1 - 0.025 ** (1 / 10), 6);
});

test('it bounds all events above by one and below by the 2.5% root', () => {
  const interval = buildClopperPearsonInterval(10, 10);

  expect(interval.upper).toBe(1);
  expect(interval.lower).toBeCloseTo(0.025 ** (1 / 10), 6);
});

test('it bounds a proportion with no trials by the whole unit range', () => {
  expect(buildClopperPearsonInterval(0, 0)).toStrictEqual({ lower: 0, upper: 1 });
});
