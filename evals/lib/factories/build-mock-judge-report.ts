import { faker } from '@faker-js/faker';
import type { JudgeReport } from '../judge-report-schema.ts';

// Each record is one judged sample, which a test adds for its scenario.
export function buildMockJudgeReport(overrides: Partial<JudgeReport> = {}): JudgeReport {
  return {
    preset: faker.lorem.slug(1),
    model: faker.lorem.slug(2),
    samplesPerCase: 3,
    requestsSent: faker.number.int({ min: 1, max: 1000 }),
    policyHash: faker.string.hexadecimal({ length: 64, prefix: '' }),
    corpusHash: faker.string.hexadecimal({ length: 64, prefix: '' }),
    eligibleFrom: ['baseline'],
    records: [],
    ...overrides,
  };
}
