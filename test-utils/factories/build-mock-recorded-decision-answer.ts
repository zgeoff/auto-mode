import type { DecisionAnswer, RecordedDecisionChoice } from '../../src/model/types.ts';

type RecordedDecisionAnswer = DecisionAnswer<RecordedDecisionChoice>;

// A recorded report holds the three-choice distribution, so the default puts
// the whole mass on the choice and zero on the other two.
export function buildMockRecordedDecisionAnswer(
  overrides: Partial<RecordedDecisionAnswer> = {},
): RecordedDecisionAnswer {
  const choice = overrides.choice ?? 'allow';

  return {
    type: 'choice',
    choice,
    confidence: 1,
    probabilities: { allow: 0, block: 0, ask: 0, [choice]: 1 },
    ...overrides,
  };
}
