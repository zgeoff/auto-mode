import { expect, test } from 'bun:test';
import { buildRecordedDecision } from './build-recorded-decision.ts';
import { pickEvaluationVerdict } from './pick-evaluation-verdict.ts';

test('it keys a shipped rule by its name, with the tier the shipped policy gives it', () => {
  const decision = buildRecordedDecision(
    { 'Data Exfiltration': ['allow', 0.9, 0.9, 0.05, 0.05] },
    { 'Data Exfiltration': 'hard' },
    'jev-1.13.0',
  );

  expect(decision.request).toStrictEqual({
    state: {
      policy: '',
      answerGuidance: '',
      rulesSource: 'shipped',
      configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
      lastUserMessage: null,
      action: { tool: '', cwd: '', input: {} },
    },
    questions: {},
    rules: {
      'Data Exfiltration': { name: 'Data Exfiltration', tier: 'hard', source: 'shipped', text: '' },
    },
  });
});

test('it names a configured rule from its request id and tiers it by its category', () => {
  const decision = buildRecordedDecision(
    { hard_deny_0: ['allow', 1, 1, 0, 0], soft_deny_2: ['allow', 1, 1, 0, 0] },
    {},
    'jev-1.13.0',
  );

  expect(decision.request.rules).toStrictEqual({
    hard_deny_0: { name: 'Configured hard_deny 1', tier: 'hard', source: 'configured', text: '' },
    soft_deny_2: { name: 'Configured soft_deny 3', tier: 'soft', source: 'configured', text: '' },
  });
});

test('it answers each rule with the recorded choice, confidence, and probabilities', () => {
  const decision = buildRecordedDecision(
    { 'History Rewrite': ['ask', 0.6, 0.3, 0.1, 0.6] },
    { 'History Rewrite': 'soft' },
    'jev-1.13.0',
  );

  expect(decision.result).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      'History Rewrite': {
        type: 'choice',
        choice: 'ask',
        confidence: 0.6,
        probabilities: { allow: 0.3, block: 0.1, ask: 0.6 },
      },
    },
    inputTokens: 0,
    requestBytes: 0,
  });
});

test('it gives a decision that a confident block denies under the rule name', () => {
  const decision = buildRecordedDecision(
    { 'Data Exfiltration': ['block', 0.95, 0.02, 0.95, 0.03], soft_deny_0: ['allow', 1, 1, 0, 0] },
    { 'Data Exfiltration': 'hard' },
    'jev-1.13.0',
  );

  expect(pickEvaluationVerdict(decision.request, decision.result, 0.8)).toStrictEqual({
    kind: 'deny',
    rule: 'Data Exfiltration',
  });
});

test('it rejects an answer for a shipped rule the policy lacks', () => {
  expect(() =>
    buildRecordedDecision({ 'Retired Rule': ['allow', 1, 1, 0, 0] }, {}, 'jev-1.13.0'),
  ).toThrowWithMessage(Error, /the shipped policy lacks: Retired Rule/u);
});
