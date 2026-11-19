import { expect, test } from 'bun:test';
import { buildWilsonInterval } from './build-wilson-interval.ts';

test.each([
  [0, 10, 0, 0.2775],
  [1, 10, 0.0179, 0.4042],
  [5, 10, 0.2366, 0.7634],
  [10, 10, 0.7225, 1],
])(
  'it bounds %d events in %d trials by the published 95%% Wilson interval',
  (events, total, lower, upper) => {
    const interval = buildWilsonInterval(events, total);

    expect(interval.lower).toBeCloseTo(lower, 4);
    expect(interval.upper).toBeCloseTo(upper, 4);
  },
);

test('it bounds a proportion with no trials by the whole unit range', () => {
  expect(buildWilsonInterval(0, 0)).toStrictEqual({ lower: 0, upper: 1 });
});
