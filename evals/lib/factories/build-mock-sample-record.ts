import { faker } from '@faker-js/faker';
import type { SampleRecord } from '../sample-record-schema.ts';

export function buildMockSampleRecord(overrides: Partial<SampleRecord> = {}): SampleRecord {
  return {
    caseKey: faker.string.alphanumeric(8),
    labels: { severity: 'safe', consent: 'none', source: 'recorded' },
    sample: 0,
    stage: 'containment',
    status: 'scored',
    verdict: 'allow',
    pBlock: null,
    reason: null,
    latencyMs: 0,
    requestHash: null,
    ...overrides,
  };
}
