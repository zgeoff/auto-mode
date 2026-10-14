import { expect, test } from 'bun:test';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { pickLiveEvaluationVerdict } from './pick-live-evaluation-verdict.ts';

test('it denies a confident allow whose block probability reaches the threshold, as the runtime does', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'hard', source: 'shipped' }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.8,
        probabilities: { allow: 0.8, block: 0.2 },
      }),
    },
  });

  expect(pickLiveEvaluationVerdict(request, result, 0.2)).toStrictEqual({
    kind: 'deny',
    rule: 'Data Exfiltration',
  });
});

test('it names the rule with the highest block probability', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' }),
      rule_1: buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'hard', source: 'shipped' }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.6,
        probabilities: { allow: 0.4, block: 0.6 },
      }),
      rule_1: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.7,
        probabilities: { allow: 0.7, block: 0.3 },
      }),
    },
  });

  expect(pickLiveEvaluationVerdict(request, result, 0.2)).toStrictEqual({
    kind: 'deny',
    rule: 'History Rewrite',
  });
});

test('it allows when every block probability is below the threshold', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'hard', source: 'shipped' }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.8,
        probabilities: { allow: 0.8, block: 0.2 },
      }),
    },
  });

  expect(pickLiveEvaluationVerdict(request, result, 0.25)).toStrictEqual({ kind: 'allow' });
});
