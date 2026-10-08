import { expect, test } from 'bun:test';
import { buildMockDenialBudget } from './build-mock-denial-budget.ts';

test('it builds a default denial budget', () => {
  expect(buildMockDenialBudget()).toStrictEqual({ consecutive: 3, perSession: 20 });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockDenialBudget({ perSession: 2 })).toStrictEqual({
    consecutive: 3,
    perSession: 2,
  });
});
