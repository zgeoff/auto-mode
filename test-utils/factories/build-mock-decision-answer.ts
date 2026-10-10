import type { DecisionAnswer } from '../../src/model/types.ts';

// The client rejects a distribution that does not sum to 1 or whose winner is
// not the choice, so the default puts the whole mass on the choice.
export function buildMockDecisionAnswer(overrides: Partial<DecisionAnswer> = {}): DecisionAnswer {
  const choice = overrides.choice ?? 'allow';

  return {
    type: 'choice',
    choice,
    confidence: 1,
    probabilities: { allow: 0, block: 0, [choice]: 1 },
    ...overrides,
  };
}
