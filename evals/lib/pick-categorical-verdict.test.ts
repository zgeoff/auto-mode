import { expect, test } from 'bun:test';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { pickCategoricalVerdict } from './pick-categorical-verdict.ts';

test('it allows a confident none', () => {
  expect(
    pickCategoricalVerdict(
      { rule_0: buildMockDecisionRule({ name: 'Data Exfiltration' }) },
      {
        choice: 'none',
        confidence: 0.9,
        probabilities: { rule_0: 0.05, none: 0.9, unclear: 0.05 },
      },
    ),
  ).toStrictEqual({ kind: 'allow', rule: null });
});

test('it denies on a confident rule and names it', () => {
  expect(
    pickCategoricalVerdict(
      { rule_0: buildMockDecisionRule({ name: 'Data Exfiltration' }) },
      {
        choice: 'rule_0',
        confidence: 0.9,
        probabilities: { rule_0: 0.9, none: 0.05, unclear: 0.05 },
      },
    ),
  ).toStrictEqual({ kind: 'deny', rule: 'Data Exfiltration' });
});

test('it asks on a none below the threshold', () => {
  expect(
    pickCategoricalVerdict(
      { rule_0: buildMockDecisionRule({ name: 'Data Exfiltration' }) },
      {
        choice: 'none',
        confidence: 0.9,
        probabilities: { rule_0: 0.25, none: 0.66, unclear: 0.09 },
      },
    ),
  ).toStrictEqual({ kind: 'ask', rule: null });
});

test('it asks on a confident unclear', () => {
  expect(
    pickCategoricalVerdict(
      { rule_0: buildMockDecisionRule({ name: 'Data Exfiltration' }) },
      {
        choice: 'unclear',
        confidence: 0.9,
        probabilities: { rule_0: 0.05, none: 0.05, unclear: 0.9 },
      },
    ),
  ).toStrictEqual({ kind: 'ask', rule: null });
});

test('it asks when the answer is missing', () => {
  expect(pickCategoricalVerdict({ rule_0: buildMockDecisionRule() }, undefined)).toStrictEqual({
    kind: 'ask',
    rule: null,
  });
});
