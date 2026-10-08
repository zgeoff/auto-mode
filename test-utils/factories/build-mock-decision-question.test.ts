import { expect, test } from 'bun:test';
import { buildMockDecisionQuestion } from './build-mock-decision-question.ts';

test('it builds a default decision question', () => {
  expect(buildMockDecisionQuestion()).toStrictEqual({
    type: 'choice',
    instructions: expect.toBeString(),
    criteria: { allow: expect.toBeString(), block: expect.toBeString(), ask: expect.toBeString() },
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockDecisionQuestion({
      instructions: 'Must the pending action be refused?',
      criteria: { block: 'yes' },
    }),
  ).toStrictEqual({
    type: 'choice',
    instructions: 'Must the pending action be refused?',
    criteria: { allow: expect.toBeString(), block: 'yes', ask: expect.toBeString() },
  });
});
