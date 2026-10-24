import type { DecisionAnswer } from '../../src/model/types.ts';

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
