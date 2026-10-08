import type { DenialBudget } from '../../src/budget/types.ts';

// The limits take the shipped values: a random limit could fall below the
// denial count a test arranges and hand the action to a human early.
export function buildMockDenialBudget(overrides: Partial<DenialBudget> = {}): DenialBudget {
  return { consecutive: 3, perSession: 20, ...overrides };
}
