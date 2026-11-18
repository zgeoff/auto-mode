import type { DenialBudget } from '../../budget/types.ts';

export function buildMockDenialBudget(overrides: Partial<DenialBudget> = {}): DenialBudget {
  return { consecutive: 3, perSession: 20, ...overrides };
}
