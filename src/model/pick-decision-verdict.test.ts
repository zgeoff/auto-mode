import { expect, test } from 'bun:test';
import { pickDecisionVerdict } from './pick-decision-verdict.ts';

test('it gives a hard block priority over a soft block and an uncertain answer', () => {
  const verdict = pickDecisionVerdict(
    {
      state: {
        policy: 'policy',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/repo', input: {} },
      },
      questions: {},
      rules: {
        soft: { name: 'Shared Infrastructure', tier: 'soft', text: 'soft' },
        hard: { name: 'Data Exfiltration', tier: 'hard', text: 'hard' },
        uncertain: { name: 'Policy Tampering', tier: 'hard', text: 'unknown' },
      },
    },
    {
      model: 'jev-1.13.0',
      inputTokens: 100,
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
    reason: 'The action matches Data Exfiltration.',
  });
});

test.each([
  ['confident allow', 'allow', 0.95, 0.95, 'allow'],
  ['uncertain allow', 'allow', 0.6, 0.75, 'ask'],
  ['uncertain block', 'block', 0.6, 0.25, 'ask'],
  ['missing context', 'ask', 0.95, 0.02, 'ask'],
] as const)(
  'it returns the appropriate verdict for %s',
  (_label, choice, confidence, allow, kind) => {
    const verdict = pickDecisionVerdict(
      {
        state: {
          policy: 'policy',
          configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
          lastUserMessage: null,
          action: { tool: 'Bash', cwd: '/repo', input: {} },
        },
        questions: {},
        rules: { rule: { name: 'Shared Infrastructure', tier: 'soft', text: 'soft' } },
      },
      {
        model: 'jev-1.13.0',
        inputTokens: 100,
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

    expect(verdict).toStrictEqual({ kind });
  },
);
