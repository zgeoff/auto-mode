import { expect, test } from 'bun:test';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { collectDecisionContributors } from './collect-decision-contributors.ts';

test('it records every rule at or above the threshold, highest block probability first', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({
        name: 'Default Branch Write',
        source: 'shipped',
        tier: 'soft',
      }),
      rule_1: buildMockDecisionRule({ name: 'History Rewrite', source: 'shipped', tier: 'soft' }),
      soft_deny_0: buildMockDecisionRule({
        name: 'private-configured-name-canary',
        source: 'configured',
        tier: 'soft',
      }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.7,
        probabilities: { allow: 0.7, block: 0.3 },
      }),
      rule_1: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.9,
        probabilities: { allow: 0.9, block: 0.1 },
      }),
      soft_deny_0: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.8,
        probabilities: { allow: 0.2, block: 0.8 },
      }),
    },
  });

  expect(collectDecisionContributors(request, result, 0.2)).toStrictEqual([
    {
      rule: 'soft_deny_0',
      source: 'configured',
      tier: 'soft',
      choice: 'block',
      confidence: 0.8,
      blockProbability: 0.8,
    },
    {
      rule: 'Default Branch Write',
      source: 'shipped',
      tier: 'soft',
      choice: 'allow',
      confidence: 0.7,
      blockProbability: 0.3,
    },
  ]);
});

test('it records no contributor when every block probability is below the threshold', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'History Rewrite', source: 'shipped' }) },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.55,
        probabilities: { allow: 0.81, block: 0.19 },
      }),
    },
  });

  expect(collectDecisionContributors(request, result, 0.2)).toStrictEqual([]);
});
