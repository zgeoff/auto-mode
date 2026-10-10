import { expect, test } from 'bun:test';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { buildMockRecordedDecisionAnswer } from '../../test-utils/factories/build-mock-recorded-decision-answer.ts';
import { buildMockRecordedDecisionResult } from '../../test-utils/factories/build-mock-recorded-decision-result.ts';
import { classifyRecordedAnswers } from './classify-recorded-answers.ts';

test('it classifies the answers as allow when every rule is a confident allow', () => {
  const request = buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } });

  const result = buildMockRecordedDecisionResult({
    answers: {
      rule_0: buildMockRecordedDecisionAnswer({
        choice: 'allow',
        confidence: 0.8,
        probabilities: { allow: 0.8, block: 0.1, ask: 0.1 },
      }),
    },
  });

  expect(classifyRecordedAnswers(request, result, 0.8)).toStrictEqual({ kind: 'allow' });
});

test('it classifies a confident block on a hard rule ahead of an earlier soft block', () => {
  const soft = buildMockDecisionRule({ tier: 'soft' });
  const hard = buildMockDecisionRule({ tier: 'hard' });
  const request = buildMockDecisionRequest({ rules: { soft, hard } });

  const result = buildMockRecordedDecisionResult({
    answers: {
      soft: buildMockRecordedDecisionAnswer({
        choice: 'block',
        confidence: 1,
        probabilities: { allow: 0, block: 1, ask: 0 },
      }),
      hard: buildMockRecordedDecisionAnswer({
        choice: 'block',
        confidence: 1,
        probabilities: { allow: 0, block: 1, ask: 0 },
      }),
    },
  });

  expect(classifyRecordedAnswers(request, result, 0.8)).toStrictEqual({
    kind: 'block',
    rule: hard,
  });
});

test.each([
  ['a block below the confidence threshold', 0.79, { allow: 0, block: 0.9, ask: 0.1 }],
  ['a block below the probability threshold', 0.9, { allow: 0, block: 0.79, ask: 0.21 }],
] as const)('it classifies %s as uncertain', (_label, confidence, probabilities) => {
  const rule = buildMockDecisionRule();
  const request = buildMockDecisionRequest({ rules: { rule_0: rule } });

  const result = buildMockRecordedDecisionResult({
    answers: {
      rule_0: buildMockRecordedDecisionAnswer({ choice: 'block', confidence, probabilities }),
    },
  });

  expect(classifyRecordedAnswers(request, result, 0.8)).toStrictEqual({ kind: 'uncertain', rule });
});

test('it names the uncertain rule with the highest block probability', () => {
  const ask = buildMockDecisionRule();
  const doubtful = buildMockDecisionRule();
  const request = buildMockDecisionRequest({ rules: { ask, doubtful } });

  const result = buildMockRecordedDecisionResult({
    answers: {
      ask: buildMockRecordedDecisionAnswer({
        choice: 'ask',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.05, ask: 0.85 },
      }),
      doubtful: buildMockRecordedDecisionAnswer({
        choice: 'allow',
        confidence: 0.5,
        probabilities: { allow: 0.5, block: 0.4, ask: 0.1 },
      }),
    },
  });

  expect(classifyRecordedAnswers(request, result, 0.8)).toStrictEqual({
    kind: 'uncertain',
    rule: doubtful,
  });
});

test('it throws when the result leaves a rule unanswered', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule(), rule_1: buildMockDecisionRule() },
  });

  const result = buildMockRecordedDecisionResult({
    answers: {
      rule_0: buildMockRecordedDecisionAnswer({
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      }),
    },
  });

  expect(() => classifyRecordedAnswers(request, result, 0.8)).toThrowWithMessage(
    Error,
    'Decision answer missing',
  );
});
