import { expect, test } from 'bun:test';
import { buildMockRecordedDecisionResult } from './build-mock-recorded-decision-result.ts';

test('it builds a default recorded decision result', () => {
  expect(buildMockRecordedDecisionResult()).toStrictEqual({
    model: expect.toBeString(),
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        probabilities: { allow: 1, block: 0, ask: 0 },
        confidence: 1,
      },
    },
    inputTokens: expect.toBePositive(),
    requestBytes: expect.toBePositive(),
  });
});

test('it applies overrides on top of the defaults', () => {
  const result = buildMockRecordedDecisionResult({
    answers: {
      rule_1: {
        type: 'choice',
        choice: 'block',
        probabilities: { allow: 0.1, block: 0.9, ask: 0 },
        confidence: 0.9,
      },
    },
    inputTokens: 400,
  });

  expect(result).toStrictEqual({
    model: expect.toBeString(),
    answers: {
      rule_1: {
        type: 'choice',
        choice: 'block',
        probabilities: { allow: 0.1, block: 0.9, ask: 0 },
        confidence: 0.9,
      },
    },
    inputTokens: 400,
    requestBytes: expect.toBePositive(),
  });
});
