import { expect, test } from 'bun:test';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { classifyDecisionAnswers } from './classify-decision-answers.ts';

test('it classifies the answers as allow when every rule is a confident allow', () => {
  const request = buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 0.8,
        probabilities: { allow: 0.8, block: 0.1, ask: 0.1 },
      },
    },
  });

  expect(classifyDecisionAnswers(request, result, 0.8)).toStrictEqual({ kind: 'allow' });
});

test('it classifies a confident block on a hard rule ahead of an earlier soft block', () => {
  const soft = buildMockDecisionRule({ tier: 'soft' });
  const hard = buildMockDecisionRule({ tier: 'hard' });
  const request = buildMockDecisionRequest({ rules: { soft, hard } });

  const result = buildMockDecisionResult({
    answers: {
      soft: {
        type: 'choice',
        choice: 'block',
        confidence: 1,
        probabilities: { allow: 0, block: 1, ask: 0 },
      },
      hard: {
        type: 'choice',
        choice: 'block',
        confidence: 1,
        probabilities: { allow: 0, block: 1, ask: 0 },
      },
    },
  });

  expect(classifyDecisionAnswers(request, result, 0.8)).toStrictEqual({
    kind: 'block',
    rule: hard,
  });
});

test.each([
  ['a block below the confidence threshold', 0.79, 0.9],
  ['a block below the probability threshold', 0.9, 0.79],
] as const)('it classifies %s as uncertain', (_label, confidence, block) => {
  const rule = buildMockDecisionRule();
  const request = buildMockDecisionRequest({ rules: { rule_0: rule } });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'block',
        confidence,
        probabilities: { allow: 0, block, ask: 1 - block },
      },
    },
  });

  expect(classifyDecisionAnswers(request, result, 0.8)).toStrictEqual({ kind: 'uncertain', rule });
});

test('it names the uncertain rule with the highest block probability', () => {
  const ask = buildMockDecisionRule();
  const doubtful = buildMockDecisionRule();
  const request = buildMockDecisionRequest({ rules: { ask, doubtful } });

  const result = buildMockDecisionResult({
    answers: {
      ask: {
        type: 'choice',
        choice: 'ask',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.05, ask: 0.85 },
      },
      doubtful: {
        type: 'choice',
        choice: 'allow',
        confidence: 0.5,
        probabilities: { allow: 0.5, block: 0.4, ask: 0.1 },
      },
    },
  });

  expect(classifyDecisionAnswers(request, result, 0.8)).toStrictEqual({
    kind: 'uncertain',
    rule: doubtful,
  });
});

test('it throws when the result leaves a rule unanswered', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule(), rule_1: buildMockDecisionRule() },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
  });

  expect(() => classifyDecisionAnswers(request, result, 0.8)).toThrowWithMessage(
    Error,
    'Decision answer missing',
  );
});
