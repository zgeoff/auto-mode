import type { DenialBudget } from '../../src/budget/types.ts';

// The limits take the shipped values: they decide when a denial hands the
// action to a human, so a random one would flip the case a test selects.
export function buildMockDenialBudget(overrides: Partial<DenialBudget> = {}): DenialBudget {
  return { consecutive: 3, perSession: 20, ...overrides };
}
