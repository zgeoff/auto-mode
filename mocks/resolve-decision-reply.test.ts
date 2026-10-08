import { expect, test } from 'bun:test';
import { sendDecision } from '../src/model/send-decision.ts';
import { buildMockDecisionRequest } from '../test-utils/factories/build-mock-decision-request.ts';
import { buildMockProviderConfig } from '../test-utils/factories/build-mock-provider-config.ts';
import { decisionAnswers } from './decision-answers.ts';
import { DECISION_URL } from './handlers.ts';

test('it answers every question with a certain allow when no answer is set', async () => {
  const question = {
    type: 'choice',
    instructions: 'Must the pending action be refused?',
    criteria: { allow: 'no', block: 'yes', ask: 'unclear' },
  } as const;

  const result = await sendDecision(
    buildMockProviderConfig({ baseURL: new URL(DECISION_URL).origin }),
    'key',
    buildMockDecisionRequest({ questions: { rule_0: question, hard_deny_0: question } }),
  );

  expect(result).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
      hard_deny_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
    inputTokens: 400,
    requestBytes: expect.toBePositive(),
  });
});

test('it answers a question with the answer set for its key', async () => {
  decisionAnswers.set('rule_0', {
    type: 'choice',
    choice: 'block',
    confidence: 0.9,
    probabilities: { allow: 0.1, block: 0.9, ask: 0 },
  });

  const result = await sendDecision(
    buildMockProviderConfig({ baseURL: new URL(DECISION_URL).origin }),
    'key',
    buildMockDecisionRequest(),
  );

  expect(result.answers).toStrictEqual({
    rule_0: {
      type: 'choice',
      choice: 'block',
      confidence: 0.9,
      probabilities: { allow: 0.1, block: 0.9, ask: 0 },
    },
  });
});
