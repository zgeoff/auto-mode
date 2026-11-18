import { expect, test } from 'bun:test';
import { buildMockRecordedDecisionAnswer } from './build-mock-recorded-decision-answer.ts';

test('it builds a default recorded decision answer', () => {
  expect(buildMockRecordedDecisionAnswer()).toStrictEqual({
    type: 'choice',
    choice: 'allow',
    confidence: 1,
    probabilities: { allow: 1, block: 0, ask: 0 },
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockRecordedDecisionAnswer({
      choice: 'block',
      confidence: 0.9,
      probabilities: { allow: 0.1, block: 0.9, ask: 0 },
    }),
  ).toStrictEqual({
    type: 'choice',
    choice: 'block',
    confidence: 0.9,
    probabilities: { allow: 0.1, block: 0.9, ask: 0 },
  });
});

test('it puts the whole probability mass on an overridden choice', () => {
  expect(buildMockRecordedDecisionAnswer({ choice: 'ask' })).toStrictEqual({
    type: 'choice',
    choice: 'ask',
    confidence: 1,
    probabilities: { allow: 0, block: 0, ask: 1 },
  });
});
