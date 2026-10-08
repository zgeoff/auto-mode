import { faker } from '@faker-js/faker';
import type { JevReport } from '../../src/evaluation/jev-report-schema.ts';

type JevContributor = JevReport['records'][number]['contributors'][number];

// The probabilities must agree with the choice, so the default is a certain block.
export function buildMockJevContributor(overrides: Partial<JevContributor> = {}): JevContributor {
  return {
    rule: faker.lorem.words(2),
    tier: 'hard',
    choice: 'block',
    confidence: 1,
    allow: 0,
    block: 1,
    ask: 0,
    ...overrides,
  };
}
