import { expect, test } from 'bun:test';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { collectDecisionContributors } from './collect-decision-contributors.ts';

test.each([
  ['explicit ask', 'ask', 0.95, { allow: 0.03, block: 0.02, ask: 0.95 }, 0.95],
  ['low confidence allow', 'allow', 0.29, { allow: 0.52, block: 0.18, ask: 0.3 }, 0.52],
  ['low probability allow', 'allow', 0.9, { allow: 0.6, block: 0.1, ask: 0.3 }, 0.6],
  ['uncertain block', 'block', 0.6, { allow: 0.2, block: 0.7, ask: 0.1 }, 0.7],
] as const)(
  'it identifies %s without changing the confidence threshold',
  (_label, choice, confidence, probabilities, probability) => {
    const request = buildMockDecisionRequest({
      rules: {
        rule_0: buildMockDecisionRule({
          name: 'Default Branch Write',
          source: 'shipped',
          tier: 'soft',
        }),
        soft_deny_0: buildMockDecisionRule({ source: 'configured', tier: 'soft' }),
      },
    });

    const result = buildMockDecisionResult({
      answers: {
        rule_0: buildMockDecisionAnswer({ choice, confidence, probabilities }),
        soft_deny_0: buildMockDecisionAnswer({
          choice: 'allow',
          confidence: 1,
          probabilities: { allow: 1, block: 0, ask: 0 },
        }),
      },
    });

    expect(collectDecisionContributors(request, result, 0.8)).toStrictEqual([
      {
        rule: 'Default Branch Write',
        source: 'shipped',
        tier: 'soft',
        choice,
        confidence,
        probability,
      },
    ]);
  },
);

test('it records every uncertain rule and uses identifiers for private configured rules', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({
        name: 'Default Branch Write',
        source: 'shipped',
        tier: 'soft',
      }),
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
        probabilities: { allow: 0.9, block: 0, ask: 0.1 },
      }),
      soft_deny_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.7,
        probabilities: { allow: 0.9, block: 0, ask: 0.1 },
      }),
    },
  });

  expect(collectDecisionContributors(request, result, 0.8)).toStrictEqual([
    {
      rule: 'Default Branch Write',
      source: 'shipped',
      tier: 'soft',
      choice: 'allow',
      confidence: 0.7,
      probability: 0.9,
    },
    {
      rule: 'soft_deny_0',
      source: 'configured',
      tier: 'soft',
      choice: 'allow',
      confidence: 0.7,
      probability: 0.9,
    },
  ]);
});

test('it identifies the winning block when a denial takes precedence over uncertainty', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({
        name: 'Default Branch Write',
        source: 'shipped',
        tier: 'soft',
      }),
      soft_deny_0: buildMockDecisionRule({ source: 'configured', tier: 'soft' }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'ask',
        confidence: 1,
        probabilities: { allow: 0, block: 0, ask: 1 },
      }),
      soft_deny_0: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 1,
        probabilities: { allow: 0, block: 1, ask: 0 },
      }),
    },
  });

  expect(collectDecisionContributors(request, result, 0.8)).toStrictEqual([
    {
      rule: 'soft_deny_0',
      source: 'configured',
      tier: 'soft',
      choice: 'block',
      confidence: 1,
      probability: 1,
    },
  ]);
});

test('it records no contributor when every rule is a confident allow', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule({ name: 'History Rewrite', source: 'shipped' }) },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.95,
        probabilities: { allow: 0.95, block: 0.05, ask: 0 },
      }),
    },
  });

  expect(collectDecisionContributors(request, result, 0.8)).toStrictEqual([]);
});

test("it records a soft rule's allow answer whose confidence is below the threshold", () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({
        name: 'Outbound Communication',
        source: 'shipped',
        tier: 'soft',
      }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.76,
        probabilities: { allow: 0.84, block: 0.03, ask: 0.13 },
      }),
    },
  });

  expect(collectDecisionContributors(request, result, 0.8)).toStrictEqual([
    {
      rule: 'Outbound Communication',
      source: 'shipped',
      tier: 'soft',
      choice: 'allow',
      confidence: 0.76,
      probability: 0.84,
    },
  ]);
});

test('it throws when the result leaves a rule unanswered', () => {
  const request = buildMockDecisionRequest({
    rules: { rule_0: buildMockDecisionRule(), rule_1: buildMockDecisionRule() },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      }),
    },
  });

  expect(() => collectDecisionContributors(request, result, 0.8)).toThrowWithMessage(
    Error,
    'Decision answer missing',
  );
});
