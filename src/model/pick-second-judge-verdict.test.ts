import { expect, test } from 'bun:test';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { pickSecondJudgeVerdict } from './pick-second-judge-verdict.ts';

test('it keeps a confident allow away from the second judge', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft' }) },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 0.95,
        probabilities: { allow: 0.95, block: 0.03, ask: 0.02 },
      },
    },
  });

  expect(pickSecondJudgeVerdict(request, result, 0.8, { kind: 'block', rule: null })).toStrictEqual(
    { eligible: false, verdict: { kind: 'allow' } },
  );
});

test('it sends an ask whose every answer chooses allow to the second judge', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft' }) },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 0.6,
        probabilities: { allow: 0.6, block: 0.1, ask: 0.3 },
      },
    },
  });

  expect(pickSecondJudgeVerdict(request, result, 0.8, null)).toStrictEqual({
    eligible: true,
    verdict: { kind: 'ask' },
  });
});

test('it allows an eligible ask when the second judge allows', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft' }) },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 0.6,
        probabilities: { allow: 0.6, block: 0.1, ask: 0.3 },
      },
    },
  });

  expect(pickSecondJudgeVerdict(request, result, 0.8, { kind: 'allow' })).toStrictEqual({
    eligible: true,
    verdict: { kind: 'allow' },
  });
});

test.each([
  ['a block that names a rule', { kind: 'block', rule: 'Irreversible Deletion' }],
  ['a block that names no rule', { kind: 'block', rule: null }],
  ['an unreadable answer', { kind: 'unreadable' }],
  ['no answer', null],
] as const)('it keeps an eligible ask when the second judge gives %s', (_label, judge) => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft' }) },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 0.6,
        probabilities: { allow: 0.6, block: 0.1, ask: 0.3 },
      },
    },
  });

  expect(pickSecondJudgeVerdict(request, result, 0.8, judge)).toStrictEqual({
    eligible: true,
    verdict: { kind: 'ask' },
  });
});

test('it keeps an ask with an answer that does not choose allow away from the second judge', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft' }) },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'ask',
        confidence: 0.6,
        probabilities: { allow: 0.3, block: 0.1, ask: 0.6 },
      },
    },
  });

  expect(pickSecondJudgeVerdict(request, result, 0.8, { kind: 'allow' })).toStrictEqual({
    eligible: false,
    verdict: { kind: 'ask' },
  });
});

test('it keeps a confident block away from the second judge', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft' }) },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'block',
        confidence: 0.95,
        probabilities: { allow: 0.02, block: 0.95, ask: 0.03 },
      },
    },
  });

  expect(pickSecondJudgeVerdict(request, result, 0.8, { kind: 'allow' })).toStrictEqual({
    eligible: false,
    verdict: { kind: 'deny', rule: 'History Rewrite' },
  });
});
