import { faker } from '@faker-js/faker';
import type { JevReport } from '../../src/evaluation/jev-report-schema.ts';

// Each record is one evaluated sample, which a test adds for its scenario.
export function buildMockJevReport(overrides: Partial<JevReport> = {}): JevReport {
  return {
    variant: 'baseline',
    model: faker.lorem.slug(2),
    threshold: 0.8,
    samplesPerCase: 3,
    requestsSent: faker.number.int({ min: 1, max: 1000 }),
    policyHash: faker.string.hexadecimal({ length: 64, prefix: '' }),
    guidanceHash: null,
    configuredRulesHash: faker.string.hexadecimal({ length: 64, prefix: '' }),
    corpusHash: faker.string.hexadecimal({ length: 64, prefix: '' }),
    records: [],
    ...overrides,
  };
}
