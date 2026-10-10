import { expect, test } from 'bun:test';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionResult } from '../../test-utils/factories/build-mock-decision-result.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { pickDecisionVerdict } from './pick-decision-verdict.ts';

test('it allows when every block probability is below the threshold', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' }),
      rule_1: buildMockDecisionRule({ name: 'Data Exfiltration', tier: 'hard', source: 'shipped' }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.81,
        probabilities: { allow: 0.81, block: 0.19 },
      }),
      rule_1: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.9,
        probabilities: { allow: 0.9, block: 0.1 },
      }),
    },
  });

  expect(pickDecisionVerdict(request, result, 0.2)).toStrictEqual({ kind: 'allow' });
});

test('it allows an unsure allow answer whose block probability is below the threshold', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({
        name: 'Outbound Communication',
        tier: 'soft',
        source: 'shipped',
      }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.52,
        probabilities: { allow: 0.85, block: 0.15 },
      }),
    },
  });

  expect(pickDecisionVerdict(request, result, 0.2)).toStrictEqual({ kind: 'allow' });
});

test('it denies when a block probability equals the threshold', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({
        name: 'Default Branch Write',
        tier: 'soft',
        source: 'shipped',
      }),
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

  expect(pickDecisionVerdict(request, result, 0.2)).toStrictEqual({
    kind: 'deny',
    rule: 'Default Branch Write',
    reason:
      'The supplied evidence cannot rule out committing, pushing, or merging directly to the default branch. A direct user instruction that names the branch clears it.',
  });
});

test('it denies when a block probability is above the threshold', () => {
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
        probabilities: { allow: 0.05, block: 0.95 },
      }),
    },
  });

  expect(pickDecisionVerdict(request, result, 0.2)).toStrictEqual({
    kind: 'deny',
    rule: 'History Rewrite',
    reason:
      'The action matches this rule: rewriting history on the default branch, a protected branch, or a branch outside the task scope. A direct user instruction that names the force push, the rewrite, or the remote branch clears it.',
  });
});

test('it allows a block probability that a higher configured threshold does not reach', () => {
  const request = buildMockDecisionRequest({
    rules: {
      rule_0: buildMockDecisionRule({ name: 'History Rewrite', tier: 'soft', source: 'shipped' }),
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      rule_0: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.7,
        probabilities: { allow: 0.7, block: 0.3 },
      }),
    },
  });

  expect(pickDecisionVerdict(request, result, 0.4)).toStrictEqual({ kind: 'allow' });
});

test('it names the rule with the highest block probability over an earlier hard rule', () => {
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
        choice: 'allow',
        confidence: 0.7,
        probabilities: { allow: 0.7, block: 0.3 },
      }),
      rule_1: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.6,
        probabilities: { allow: 0.4, block: 0.6 },
      }),
      rule_2: buildMockDecisionAnswer({
        choice: 'allow',
        confidence: 0.99,
        probabilities: { allow: 0.99, block: 0.01 },
      }),
    },
  });

  expect(pickDecisionVerdict(request, result, 0.2)).toStrictEqual({
    kind: 'deny',
    rule: 'Default Branch Write',
    reason:
      'The action matches this rule: committing, pushing, or merging directly to the default branch. A direct user instruction that names the branch clears it.',
  });
});

test('it names the hard rule when a hard and a soft rule tie on block probability', () => {
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
    },
  });

  const result = buildMockDecisionResult({
    answers: {
      soft: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.9 },
      }),
      hard: buildMockDecisionAnswer({
        choice: 'block',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.9 },
      }),
    },
  });

  expect(pickDecisionVerdict(request, result, 0.2)).toStrictEqual({
    kind: 'deny',
    rule: 'Data Exfiltration',
    reason:
      'The action matches this rule: the harm this rule of the configured replacement policy describes. The replacement policy defines what clears it.',
  });
});
