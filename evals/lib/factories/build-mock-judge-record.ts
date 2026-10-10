import { faker } from '@faker-js/faker';
import type { JudgeReport } from '../judge-report-schema.ts';

type JudgeRecord = JudgeReport['records'][number];

export function buildMockJudgeRecord(overrides: Partial<JudgeRecord> = {}): JudgeRecord {
  return {
    case: faker.string.alphanumeric(8),
    sample: 1,
    verdict: 'allow',
    rule: null,
    failureReason: null,
    elapsedMs: faker.number.int({ min: 1, max: 10_000 }),
    outputTokens: faker.number.int({ min: 1, max: 4000 }),
    tail: null,
    ...overrides,
  };
}
