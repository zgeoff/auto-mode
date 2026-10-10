import { expect, test } from 'bun:test';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { collectBlockingRules } from './collect-blocking-rules.ts';

test.each([
  ['below', 0.19, []],
  ['at', 0.2, ['rule_0']],
  ['above', 0.21, ['rule_0']],
] as const)('it treats a block probability %s the threshold as %j', (_label, block, ids) => {
  const request = buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 1 - block,
        probabilities: { allow: 1 - block, block },
      }),
    },
  });

  expect(collectBlockingRules(request, result, 0.2).map((entry) => entry.id)).toStrictEqual([
    ...ids,
  ]);
});

test('it orders by block probability, then hard before soft, then policy order', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({ tier: 'soft' }),
      rule_1: buildMockDecisionRule({ tier: 'soft' }),
      rule_2: buildMockDecisionRule({ tier: 'hard' }),
      rule_3: buildMockDecisionRule({ tier: 'soft' }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.6,
        probabilities: { allow: 0.6, block: 0.4 },
      }),
      rule_1: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.6,
        probabilities: { allow: 0.6, block: 0.4 },
      }),
      rule_2: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.6,
        probabilities: { allow: 0.6, block: 0.4 },
      }),
      rule_3: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.7,
        probabilities: { allow: 0.3, block: 0.7 },
      }),
    },
  });

  expect(collectBlockingRules(request, result, 0.2).map((entry) => entry.id)).toStrictEqual([
    'rule_3',
    'rule_2',
    'rule_0',
    'rule_1',
  ]);
});

test('it throws when the result leaves a rule unanswered', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule(), rule_1: buildMockDecisionRule() },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0 },
      }),
    },
  });

  expect(() => collectBlockingRules(request, result, 0.2)).toThrowWithMessage(
    Error,
    'Decision answer missing',
  );
});
