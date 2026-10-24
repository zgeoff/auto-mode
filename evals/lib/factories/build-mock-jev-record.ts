import { faker } from '@faker-js/faker';
import type { JevReport } from '../jev-report-schema.ts';

type JevRecord = JevReport['records'][number];

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
