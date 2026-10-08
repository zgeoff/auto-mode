import { faker } from '@faker-js/faker';
import type { DecisionRule } from '../../src/model/types.ts';

export function buildMockDecisionRule(overrides: Partial<DecisionRule> = {}): DecisionRule {
  return {
    name: faker.lorem.words(2),
    tier: 'hard',
    source: 'shipped',
    text: faker.lorem.paragraph(),
    ...overrides,
  };
}
