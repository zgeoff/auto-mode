import { expect, test } from 'bun:test';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { pickDecisionVerdict } from './pick-decision-verdict.ts';

test('it gives a hard block priority over a soft block and an uncertain answer', () => {
  const request = buildMockDecisionRequest({
    rules: {
      soft: buildMockDecisionRule({
        name: 'Shared Infrastructure',
        tier: 'soft',
        source: 'replacement',
      }),
      hard: buildMockDecisionRule({
        name: 'Data Exfiltration',
        tier: 'hard',
        source: 'replacement',
      }),
      uncertain: buildMockDecisionRule({
        name: 'Policy Tampering',
        tier: 'hard',
        source: 'replacement',
      }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      soft: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 1,
        probabilities: { allow: 0, block: 1, ask: 0 },
      }),
      hard: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 1,
        probabilities: { allow: 0, block: 1, ask: 0 },
      }),
      uncertain: buildMockDecisionAnswer({
        choice: 'ask',
        confidence: 1,
        probabilities: { allow: 0, block: 0, ask: 1 },
      }),
    },
  });

  expect(pickDecisionVerdict(request, result, 0.8)).toStrictEqual({
    kind: 'deny',
    rule: 'Data Exfiltration',
    reason:
      'The action matches this rule: the harm this rule of the configured replacement policy describes. The replacement policy defines what clears it.',
  });
});

test.each([
  ['an uncertain allow', 'allow', 0.6, { allow: 0.75, block: 0.25, ask: 0 }],
  ['an uncertain block', 'block', 0.6, { allow: 0.25, block: 0.75, ask: 0 }],
  ['an ask for missing context', 'ask', 0.95, { allow: 0.02, block: 0.03, ask: 0.95 }],
] as const)(
  'it denies with an unresolved reason for %s',
  (_label, choice, confidence, probabilities) => {
    const request = buildMockDecisionRequest({
      rules: {
        rule: buildMockDecisionRule({
          name: 'Shared Infrastructure',
          tier: 'soft',
          source: 'replacement',
        }),
      },
    });

    const result = buildMockDecisionResult({
      answers: {
        rule: buildMockDecisionAnswer({ choice, confidence, probabilities }),
      },
    });

    expect(pickDecisionVerdict(request, result, 0.8)).toStrictEqual({
      kind: 'deny',
      rule: 'Shared Infrastructure',
      reason:
        'The supplied evidence cannot rule out the harm this rule of the configured replacement policy describes. The replacement policy defines what clears it.',
    });
  },
);

test('it allows when every rule is a confident allow', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' }),
    },
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

  expect(pickDecisionVerdict(request, result, 0.8)).toStrictEqual({ kind: 'allow' });
});

test('it names the shipped rule and its fixed reason when a block is confident', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.95,
        probabilities: { allow: 0.02, block: 0.95, ask: 0.03 },
      }),
    },
  });

  expect(pickDecisionVerdict(request, result, 0.8)).toStrictEqual({
    kind: 'deny',
    rule: 'History Rewrite',
    reason:
      'The action matches this rule: rewriting history on the default branch, a protected branch, or a branch outside the task scope. A direct user instruction that names the force push, the rewrite, or the remote branch clears it.',
  });
});

test('it names the uncertain rule with the highest block probability', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'hard', source: 'shipped' }),
      rule_1: buildMockDecisionRule({
        name: 'Default Branch Write',
        tier: 'soft',
        source: 'shipped',
      }),
      rule_2: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'ask',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.05, ask: 0.85 },
      }),
      rule_1: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.6,
        probabilities: { allow: 0.3, block: 0.6, ask: 0.1 },
      }),
      rule_2: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.99,
        probabilities: { allow: 0.99, block: 0.01, ask: 0 },
      }),
    },
  });

  expect(pickDecisionVerdict(request, result, 0.8)).toStrictEqual({
    kind: 'deny',
    rule: 'Default Branch Write',
    reason:
      'The supplied evidence cannot rule out committing, pushing, or merging directly to the default branch. A direct user instruction that names the branch clears it.',
  });
});

test("it denies a soft rule's allow answer whose confidence is below the threshold", () => {
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

  expect(pickDecisionVerdict(request, result, 0.8)).toStrictEqual({
    kind: 'deny',
    rule: 'Outbound Communication',
    reason:
      "The supplied evidence cannot rule out sending a message to people outside the checkout's repositories and the channels the user named. A direct user instruction that says the message is sent, and to whom or where, clears it.",
  });
});
