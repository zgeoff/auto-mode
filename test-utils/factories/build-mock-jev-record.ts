import { faker } from '@faker-js/faker';
import type { JevReport } from '../../src/evaluation/jev-report-schema.ts';

type JevRecord = JevReport['records'][number];

// A record's answers must reproduce its status, so the default is one rule
// that Jev allowed with certainty: an allow with no contributors.
export function buildMockJevRecord(overrides: Partial<JevRecord> = {}): JevRecord {
  return {
    case: faker.string.alphanumeric(8),
    sample: 1,
    status: 'allow',
    failureReason: null,
    rule: null,
    ruleCount: 1,
    contributors: [],
    elapsedMs: faker.number.int({ min: 1, max: 10_000 }),
    requestBytes: faker.number.int({ min: 1, max: 100_000 }),
    ...overrides,
  };
}
