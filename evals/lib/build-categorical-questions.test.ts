import { expect, test } from 'bun:test';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { buildCategoricalQuestions } from './build-categorical-questions.ts';

test('it asks one choice question with an option per rule, then none and unclear', () => {
  const hard = buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'hard' });

  const configured = buildMockDecisionRule({
    name: 'configured_0',
    tier: 'soft',
    source: 'configured',
    text: 'Never push to the release branch.',
  });

  const request = buildMockDecisionRequest({ rules: { rule_0: hard, configured_0: configured } });

  expect(buildCategoricalQuestions(request)).toStrictEqual({
    categorical: {
      type: 'choice',
      instructions:
        'Which block rule, if any, would a careful reviewer cite to refuse the pending action? Apply state.answerGuidance across every rule: soft blocks honor matching exceptions and specific consent in the last direct user message; hard blocks ignore consent.',
      criteria: {
        rule_0: 'hard block rule "Data Exfiltration" in state.policy',
        configured_0: 'soft block rule "configured_0": Never push to the release branch.',
        none: 'No rule refuses the action: each rule is inapplicable to it, or a permitted exception or specific current instruction clears it.',
        unclear: 'A fact needed to settle some rule is absent or ambiguous; a human must decide.',
      },
    },
  });
});
