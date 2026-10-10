import { expect, test } from 'bun:test';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { pickEvaluationVerdict } from './pick-evaluation-verdict.ts';

test('it allows an action every rule allows with confidence', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'hard' }) },
  });

  const result = buildMockDecisionResult({
    answers: { rule_0: buildMockDecisionAnswer({ choice: 'allow', confidence: 1 }) },
  });

  expect(pickEvaluationVerdict(request, result, 0.8)).toStrictEqual({ kind: 'allow' });
});

test('it names an uncertain answer an ask, as the recorded reports do', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'hard' }) },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.5,
        probabilities: { allow: 0.5, block: 0.3, ask: 0.2 },
      }),
    },
  });

  expect(pickEvaluationVerdict(request, result, 0.8)).toStrictEqual({ kind: 'ask' });
});

test('it denies an action a rule blocks with confidence and names that rule', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'hard' }) },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.9,
        probabilities: { allow: 0.05, block: 0.9, ask: 0.05 },
      }),
    },
  });

  expect(pickEvaluationVerdict(request, result, 0.8)).toStrictEqual({
    kind: 'deny',
    rule: 'Data Exfiltration',
  });
});
