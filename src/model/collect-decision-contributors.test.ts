import { expect, test } from 'bun:test';
import { collectDecisionContributors } from './collect-decision-contributors.ts';
import { pickDecisionVerdict } from './pick-decision-verdict.ts';
import type { DecisionRequest, DecisionResult } from './types.ts';

const request: DecisionRequest = {
  state: {
    policy: 'policy',
    answerGuidance: 'Apply the policy.',
    rulesSource: 'shipped',
    configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
    lastUserMessage: null,
    action: { tool: 'Bash', cwd: '/repo', input: {} },
  },
  questions: {},
  rules: {
    rule_0: {
      name: 'Default Branch Write',
      source: 'shipped',
      tier: 'soft',
      text: 'private-policy-canary',
    },
    soft_deny_0: {
      name: 'private-configured-name-canary',
      source: 'configured',
      tier: 'soft',
      text: 'private-configured-rule-canary',
    },
  },
};

test.each([
  ['explicit ask', 'ask', 0.95, 0.95],
  ['low confidence allow', 'allow', 0.29, 0.52],
  ['low probability allow', 'allow', 0.9, 0.6],
  ['uncertain block', 'block', 0.6, 0.7],
] as const)(
  'it identifies %s without changing the ask threshold',
  (_label, choice, confidence, probability) => {
    const probabilities = { allow: 0, block: 0, ask: 0, [choice]: probability };

    const result: DecisionResult = {
      model: 'private-model-canary',
      inputTokens: 100,
      answers: {
        rule_0: { type: 'choice', choice, confidence, probabilities },
        soft_deny_0: {
          type: 'choice',
          choice: 'allow',
          confidence: 1,
          probabilities: { allow: 1, block: 0, ask: 0 },
        },
      },
    };

    const verdict = pickDecisionVerdict(request, result, 0.8);

    expect(verdict).toStrictEqual({ kind: 'ask' });

    expect(collectDecisionContributors(request, result, verdict, 0.8)).toStrictEqual([
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
  const result: DecisionResult = {
    model: 'private-model-canary',
    inputTokens: 100,
    answers: Object.fromEntries(
      Object.keys(request.rules).map((id) => [
        id,
        {
          type: 'choice',
          choice: 'allow',
          confidence: 0.7,
          probabilities: { allow: 0.9, block: 0, ask: 0.1 },
        },
      ]),
    ),
  };

  const verdict = pickDecisionVerdict(request, result, 0.8);
  const contributors = collectDecisionContributors(request, result, verdict, 0.8);

  expect(contributors.map((entry) => entry.rule)).toStrictEqual([
    'Default Branch Write',
    'soft_deny_0',
  ]);

  expect(JSON.stringify(contributors)).not.toInclude('private-');
});

test('it identifies the winning block when a denial takes precedence over uncertainty', () => {
  const result: DecisionResult = {
    model: 'jev',
    inputTokens: 100,
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'ask',
        confidence: 1,
        probabilities: { allow: 0, block: 0, ask: 1 },
      },
      soft_deny_0: {
        type: 'choice',
        choice: 'block',
        confidence: 1,
        probabilities: { allow: 0, block: 1, ask: 0 },
      },
    },
  };

  const verdict = pickDecisionVerdict(request, result, 0.8);

  expect(verdict.kind).toBe('deny');

  expect(collectDecisionContributors(request, result, verdict, 0.8)).toStrictEqual([
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

test('it preserves the observed routine-commit ask when outbound confidence is below the threshold', () => {
  const outboundRequest: DecisionRequest = {
    ...request,
    rules: {
      rule_0: {
        name: 'Outbound Communication',
        source: 'shipped',
        tier: 'soft',
        text: 'Outbound rule',
      },
    },
    state: {
      ...request.state,
      action: {
        tool: 'Bash',
        cwd: '/repo/.worktrees/fix-detail',
        input: {
          command:
            'git add src/parser.ts && git commit -m "fix: repair parser" && git log --oneline -2',
        },
      },
    },
  };

  const result: DecisionResult = {
    model: 'recorded',
    inputTokens: 0,
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 0.76,
        probabilities: { allow: 0.84, block: 0.03, ask: 0.13 },
      },
    },
  };

  const verdict = pickDecisionVerdict(outboundRequest, result, 0.8);

  expect(verdict).toStrictEqual({ kind: 'ask' });

  expect(collectDecisionContributors(outboundRequest, result, verdict, 0.8)).toStrictEqual([
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
