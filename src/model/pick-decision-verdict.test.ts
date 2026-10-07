import { expect, test } from 'bun:test';
import { pickDecisionVerdict } from './pick-decision-verdict.ts';

test('it gives a hard block priority over a soft block and an uncertain answer', () => {
  const verdict = pickDecisionVerdict(
    {
      state: {
        policy: 'policy',
        answerGuidance: 'Apply the policy.',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/repo', input: {} },
      },
      questions: {},
      rules: {
        soft: { name: 'Shared Infrastructure', tier: 'soft', source: 'replacement', text: 'soft' },
        hard: { name: 'Data Exfiltration', tier: 'hard', source: 'replacement', text: 'hard' },
        uncertain: {
          name: 'Policy Tampering',
          tier: 'hard',
          source: 'replacement',
          text: 'unknown',
        },
      },
    },
    {
      model: 'jev-1.13.0',
      inputTokens: 100,
      requestBytes: 0,
      answers: {
        soft: {
          type: 'choice',
          choice: 'block',
          confidence: 1,
          probabilities: { allow: 0, block: 1, ask: 0 },
        },
        hard: {
          type: 'choice',
          choice: 'block',
          confidence: 1,
          probabilities: { allow: 0, block: 1, ask: 0 },
        },
        uncertain: {
          type: 'choice',
          choice: 'ask',
          confidence: 1,
          probabilities: { allow: 0, block: 0, ask: 1 },
        },
      },
    },
    0.8,
  );

  expect(verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Data Exfiltration',
    reason:
      'The action matches this rule: the harm this rule of the configured replacement policy describes. The replacement policy defines what clears it.',
  });
});

test.each([
  ['uncertain allow', 'allow', 0.6, 0.75],
  ['uncertain block', 'block', 0.6, 0.25],
  ['missing context', 'ask', 0.95, 0.02],
] as const)('it denies with an unresolved reason for %s', (_label, choice, confidence, allow) => {
  const verdict = pickDecisionVerdict(
    {
      state: {
        policy: 'policy',
        answerGuidance: 'Apply the policy.',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/repo', input: {} },
      },
      questions: {},
      rules: {
        rule: {
          name: 'Shared Infrastructure',
          tier: 'soft',
          source: 'replacement',
          text: 'soft',
        },
      },
    },
    {
      model: 'jev-1.13.0',
      inputTokens: 100,
      requestBytes: 0,
      answers: {
        rule: {
          type: 'choice',
          choice,
          confidence,
          probabilities: { allow, block: 1 - allow, ask: 0 },
        },
      },
    },
    0.8,
  );

  expect(verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Shared Infrastructure',
    reason:
      'The supplied evidence cannot rule out the harm this rule of the configured replacement policy describes. The replacement policy defines what clears it.',
  });
});

test('it allows when every rule is a confident allow', () => {
  const verdict = pickDecisionVerdict(
    {
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
        rule_0: { name: 'History Rewrite', tier: 'soft', source: 'shipped', text: 'soft' },
      },
    },
    {
      model: 'jev-1.13.0',
      inputTokens: 100,
      requestBytes: 0,
      answers: {
        rule_0: {
          type: 'choice',
          choice: 'allow',
          confidence: 0.95,
          probabilities: { allow: 0.95, block: 0.05, ask: 0 },
        },
      },
    },
    0.8,
  );

  expect(verdict).toStrictEqual({ kind: 'allow' });
});

test('it names the shipped rule and its fixed reason when a block is confident', () => {
  const verdict = pickDecisionVerdict(
    {
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
        rule_0: { name: 'History Rewrite', tier: 'soft', source: 'shipped', text: 'soft' },
      },
    },
    {
      model: 'jev-1.13.0',
      inputTokens: 100,
      requestBytes: 0,
      answers: {
        rule_0: {
          type: 'choice',
          choice: 'block',
          confidence: 0.95,
          probabilities: { allow: 0.02, block: 0.95, ask: 0.03 },
        },
      },
    },
    0.8,
  );

  expect(verdict).toStrictEqual({
    kind: 'deny',
    rule: 'History Rewrite',
    reason:
      'The action matches this rule: rewriting history that others may already hold. A direct user instruction that names the force push, the rewrite, or the remote branch clears it.',
  });
});

test('it names the uncertain rule with the highest block probability', () => {
  const verdict = pickDecisionVerdict(
    {
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
        rule_0: { name: 'Data Exfiltration', tier: 'hard', source: 'shipped', text: 'hard' },
        rule_1: { name: 'Default Branch Write', tier: 'soft', source: 'shipped', text: 'soft' },
        rule_2: { name: 'History Rewrite', tier: 'soft', source: 'shipped', text: 'soft' },
      },
    },
    {
      model: 'jev-1.13.0',
      inputTokens: 100,
      requestBytes: 0,
      answers: {
        rule_0: {
          type: 'choice',
          choice: 'ask',
          confidence: 0.9,
          probabilities: { allow: 0.1, block: 0.05, ask: 0.85 },
        },
        rule_1: {
          type: 'choice',
          choice: 'block',
          confidence: 0.6,
          probabilities: { allow: 0.3, block: 0.6, ask: 0.1 },
        },
        rule_2: {
          type: 'choice',
          choice: 'allow',
          confidence: 0.99,
          probabilities: { allow: 0.99, block: 0.01, ask: 0 },
        },
      },
    },
    0.8,
  );

  expect(verdict).toStrictEqual({
    kind: 'deny',
    rule: 'Default Branch Write',
    reason:
      'The supplied evidence cannot rule out committing, pushing, or merging directly to the default branch. A direct user instruction that names the branch clears it.',
  });
});
