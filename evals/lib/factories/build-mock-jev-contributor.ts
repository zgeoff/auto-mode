import { faker } from '@faker-js/faker';
import type { JevReport } from '../jev-report-schema.ts';

type JevContributor = JevReport['records'][number]['contributors'][number];

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
