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
    misreadClears: false,
  });
});

test('it lets a misread clear a shipped hard rule that blocks alone with a low block probability Jev chose to allow', () => {
  const hard = buildMockDecisionRule({
    name: 'Secret Persistence',
    tier: 'hard',
    source: 'shipped',
  });

  const request = buildMockDecisionRequest({ rules: { rule_1: hard } });

  const result = buildMockDecisionResult({
    answers: {
      rule_1: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.58,
        probabilities: { allow: 0.79, block: 0.21 },
      }),
    },
  });

  expect(findReviewedRule(request, result, 0.2)).toStrictEqual({
    rule: hard,
    basis: 'unresolved',
    misreadClears: true,
  });
});

test.each([
  ['a shipped rule at a block probability of 0.35', 'shipped', 0.35, true],
  ['a shipped rule at a block probability of 0.36', 'shipped', 0.36, false],
  ['a configured hard deny entry at a block probability of 0.21', 'configured', 0.21, false],
] as const)(
  'it marks whether a misread clears a lone hard deny Jev chose to allow for %s',
  (_, source, block, expected) => {
    const hard = buildMockDecisionRule({ name: 'Secret Persistence', tier: 'hard', source });
    const request = buildMockDecisionRequest({ rules: { rule_1: hard } });

    const result = buildMockDecisionResult({
      answers: {
        rule_1: buildMockDecisionAnswer({
          choice: 'allow',
          confidence: 1 - block,
          probabilities: { allow: 1 - block, block },
        }),
      },
    });

    expect(findReviewedRule(request, result, 0.2)?.misreadClears).toBe(expected);
  },
);

test('it keeps a low-probability hard deny final when a soft rule also blocks', () => {
  const soft = buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' });

  const hard = buildMockDecisionRule({
    name: 'Secret Persistence',
    tier: 'hard',
    source: 'shipped',
  });

  const request = buildMockDecisionRequest({ rules: { rule_0: soft, rule_1: hard } });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.9 },
      }),
      rule_1: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.79,
        probabilities: { allow: 0.79, block: 0.21 },
      }),
    },
  });

  expect(findReviewedRule(request, result, 0.2)).toStrictEqual({
    rule: hard,
    basis: 'unresolved',
    misreadClears: false,
  });
});

test.each([
  ['a shipped soft rule Jev chose to allow at 0.29', ['soft', 'shipped'], ['allow', 0.29], true],
  [
    'a replacement soft rule Jev chose to allow at 0.35',
    ['soft', 'replacement'],
    ['allow', 0.35],
    true,
  ],
  ['a shipped soft rule Jev chose to allow at 0.36', ['soft', 'shipped'], ['allow', 0.36], false],
  ['a shipped soft rule Jev chose to block at 0.62', ['soft', 'shipped'], ['block', 0.62], false],
  [
    'a configured soft deny entry Jev chose to allow at 0.29',
    ['soft', 'configured'],
    ['allow', 0.29],
    false,
  ],
  [
    'a second shipped hard rule Jev chose to allow at 0.29',
    ['hard', 'shipped'],
    ['allow', 0.29],
    false,
  ],
] as const)(
  'it marks whether a misread clears a doubted hard deny when %s also blocks',
  (_, [tier, source], [choice, block], expected) => {
    const hard = buildMockDecisionRule({
      name: 'Audit Tampering',
      tier: 'hard',
      source: 'shipped',
    });

    const other = buildMockDecisionRule({ name: 'Default Branch Write', tier, source });
    const request = buildMockDecisionRequest({ rules: { rule_3: hard, rule_8: other } });

    const result = buildMockDecisionResult({
      answers: {
        rule_3: buildMockDecisionAnswer({
          choice: 'allow',
          confidence: 0.67,
          probabilities: { allow: 0.67, block: 0.33 },
        }),
        rule_8: buildMockDecisionAnswer({
          choice,
          confidence: 0.7,
          probabilities: { allow: 1 - block, block },
        }),
      },
    });

    expect(findReviewedRule(request, result, 0.2)).toStrictEqual({
      rule: hard,
      basis: 'unresolved',
      misreadClears: expected,
    });
  },
);

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

  expect(findReviewedRule(request, result, 0.2)).toStrictEqual({
    rule: top,
    basis: 'matched',
    misreadClears: false,
  });
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
