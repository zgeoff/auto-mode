import type { DenialBudget } from '../../src/budget/types.ts';

export function buildMockDenialBudget(overrides: Partial<DenialBudget> = {}): DenialBudget {
  return { consecutive: 3, perSession: 20, ...overrides };
}
