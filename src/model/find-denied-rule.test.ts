import { expect, test } from 'bun:test';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { findDeniedRule } from './find-denied-rule.ts';

test('it finds a rule that Jev blocks as matched', () => {
  const rule = buildMockDecisionRule({
    name: 'Data Exfiltration',
    tier: 'hard',
    source: 'shipped',
  });

  const request = buildMockDecisionRequest({ rules: { rule_0: rule } });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.9 },
      }),
    },
  });

  expect(findDeniedRule(request, result, 0.2)).toStrictEqual({ rule, basis: 'matched' });
});

test('it finds an unsure allow whose block probability reaches the threshold as unresolved', () => {
  const rule = buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' });
  const request = buildMockDecisionRequest({ rules: { rule_0: rule } });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.7,
        probabilities: { allow: 0.7, block: 0.3 },
      }),
    },
  });

  expect(findDeniedRule(request, result, 0.2)).toStrictEqual({ rule, basis: 'unresolved' });
});

test('it finds no rule when every block probability is below the threshold', () => {
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

  expect(findDeniedRule(request, result, 0.2)).toBeNull();
});
