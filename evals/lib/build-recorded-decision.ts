import type { DecisionRequest, DecisionResult, DecisionRule } from 'auto-mode';
import type { RecordedAnswer } from './corpora/recorded-answer-schema.ts';

export interface RecordedDecision {
  readonly request: DecisionRequest;
  readonly result: DecisionResult;
}

// An evaluation script keys a shipped rule's answer by the rule's name and a
// configured rule's answer by its request id, such as `hard_deny_0`.
export function buildRecordedDecision(
  answers: Readonly<Record<string, RecordedAnswer>>,
  tiers: Readonly<Record<string, DecisionRule['tier']>>,
  model: string,
): RecordedDecision {
  const entries = Object.entries(answers).map(
    ([key, [choice, confidence, allow, block, ask]]) =>
      [
        key,
        {
          rule: buildRule(key, tiers),
          answer: {
            type: 'choice' as const,
            choice,
            confidence,
            probabilities: { allow, block, ask },
          },
        },
      ] as const,
  );

  // A verdict reads only the rules and their answers, and a replay builds one
  // per recorded sample, so the rest of the request stays empty.
  return {
    request: {
      state: {
        policy: '',
        answerGuidance: '',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: '', cwd: '', input: {} },
      },
      questions: {},
      rules: Object.fromEntries(entries.map(([key, entry]) => [key, entry.rule])),
    },
    result: {
      model,
      answers: Object.fromEntries(entries.map(([key, entry]) => [key, entry.answer])),
      inputTokens: 0,
      requestBytes: 0,
    },
  };
}

const CONFIGURED_KEY = /^(?<category>hard_deny|soft_deny)_(?<index>\d+)$/u;

// Recorded answers can name a rule the shipped policy has retired; each replays at
// the tier it held when the answers were recorded.
const RETIRED_RULE_TIERS: Readonly<Record<string, DecisionRule['tier']>> = {
  'Interrupted Action Retry': 'soft',
  'Security Control Removal': 'soft',
  'Mass Modification': 'soft',
};

function buildRule(
  key: string,
  tiers: Readonly<Record<string, DecisionRule['tier']>>,
): DecisionRule {
  const configured = CONFIGURED_KEY.exec(key)?.groups;
  const category = configured?.['category'];
  const index = configured?.['index'];

  if (category !== undefined && index !== undefined) {
    return {
      name: `Configured ${category} ${Number(index) + 1}`,
      tier: category === 'hard_deny' ? 'hard' : 'soft',
      source: 'configured',
      text: '',
    };
  }

  const tier = tiers[key] ?? RETIRED_RULE_TIERS[key];

  if (tier === undefined) {
    throw new Error(`The recorded answers name a rule the shipped policy lacks: ${key}`);
  }

  return { name: key, tier, source: 'shipped', text: '' };
}
