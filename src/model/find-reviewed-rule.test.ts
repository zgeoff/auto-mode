import { expect, test } from 'bun:test';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { findReviewedRule } from './find-reviewed-rule.ts';

test('it reviews a blocking hard rule ranked below a soft rule', () => {
  const soft = buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' });

  const hard = buildMockDecisionRule({
    name: 'Never touch the deploy key',
    tier: 'hard',
    source: 'configured',
  });

  const request = buildMockDecisionRequest({ rules: { rule_0: soft, hard_deny_0: hard } });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.95,
        probabilities: { allow: 0.05, block: 0.95 },
      }),
      hard_deny_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.6,
        probabilities: { allow: 0.6, block: 0.4 },
      }),
    },
  });

  expect(findReviewedRule(request, result, 0.2)).toStrictEqual({
    rule: hard,
    basis: 'unresolved',
  });
});

test('it reviews the top soft rule when no hard rule blocks', () => {
  const top = buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' });

  const lower = buildMockDecisionRule({
    name: 'Irreversible Deletion',
    tier: 'soft',
    source: 'shipped',
  });

  const hard = buildMockDecisionRule({
    name: 'Data Exfiltration',
    tier: 'hard',
    source: 'shipped',
  });

  const request = buildMockDecisionRequest({
    rules: { rule_0: top, rule_1: lower, rule_2: hard },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.9 },
      }),
      rule_1: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.7,
        probabilities: { allow: 0.7, block: 0.3 },
      }),
      rule_2: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.95,
        probabilities: { allow: 0.95, block: 0.05 },
      }),
    },
  });

  expect(findReviewedRule(request, result, 0.2)).toStrictEqual({ rule: top, basis: 'matched' });
});

test('it reviews no rule when every block probability is below the threshold', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.9,
        probabilities: { allow: 0.9, block: 0.1 },
      }),
    },
  });

  expect(findReviewedRule(request, result, 0.2)).toBeNull();
});
