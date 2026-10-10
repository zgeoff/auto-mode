import { expect, test } from 'bun:test';
import { buildRuleOfThreeBound } from './build-rule-of-three-bound.ts';

test.each([
  [26, 3 / 26],
  [300, 0.01],
  [2, 1],
  [0, 1],
])('it bounds zero events in %d cases below %p', (total, bound) => {
  expect(buildRuleOfThreeBound(total)).toBe(bound);
});
