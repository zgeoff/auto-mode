import type { DecisionAnswer, RecordedDecisionChoice } from '../../src/model/types.ts';

type RecordedDecisionAnswer = DecisionAnswer<RecordedDecisionChoice>;

export function buildMockRecordedDecisionAnswer(
  overrides: Partial<RecordedDecisionAnswer> = {},
): RecordedDecisionAnswer {
  const choice = overrides.choice ?? 'allow';

  return {
    type: 'choice',
    choice,
    confidence: 1,

    // a recorded report holds the three-choice distribution
    probabilities: { allow: 0, block: 0, ask: 0, [choice]: 1 },
    ...overrides,
  };
}
