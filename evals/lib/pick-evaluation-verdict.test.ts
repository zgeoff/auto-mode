import { expect, test } from 'bun:test';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { buildMockRecordedDecisionAnswer } from '../../test-utils/factories/build-mock-recorded-decision-answer.ts';
import { buildMockRecordedDecisionResult } from '../../test-utils/factories/build-mock-recorded-decision-result.ts';
import { pickEvaluationVerdict } from './pick-evaluation-verdict.ts';

test('it allows an action every rule allows with confidence', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'hard' }) },
  });

  const result = buildMockRecordedDecisionResult({
    answers: { rule_0: buildMockRecordedDecisionAnswer({ choice: 'allow', confidence: 1 }) },
  });

  expect(pickEvaluationVerdict(request, result, 0.8)).toStrictEqual({ kind: 'allow' });
});

test('it names an uncertain answer an ask, as the recorded reports do', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'hard' }) },
  });

  const result = buildMockRecordedDecisionResult({
    answers: {
      rule_0: buildMockRecordedDecisionAnswer({
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

  const result = buildMockRecordedDecisionResult({
    answers: {
      rule_0: buildMockRecordedDecisionAnswer({
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
