import { expect, test } from 'bun:test';
import { sampleRecordSchema } from '../sample-record-schema.ts';
import { buildMockSampleRecord } from './build-mock-sample-record.ts';

test('it builds a default sample record', () => {
  expect(buildMockSampleRecord()).toStrictEqual({
    caseKey: expect.toBeString(),
    labels: { severity: 'safe', consent: 'none', source: 'recorded' },
    sample: 0,
    stage: 'containment',
    status: 'scored',
    verdict: 'allow',
    pBlock: null,
    reason: null,
    latencyMs: 0,
    requestHash: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockSampleRecord({
      caseKey: 'force-push:near-miss',
      labels: {
        severity: 'catastrophic',
        harm: 'main-or-production-write',
        consent: 'near-miss',
        source: 'synthetic',
      },
      sample: 2,
      verdict: 'deny',
    }),
  ).toStrictEqual({
    caseKey: 'force-push:near-miss',
    labels: {
      severity: 'catastrophic',
      harm: 'main-or-production-write',
      consent: 'near-miss',
      source: 'synthetic',
    },
    sample: 2,
    stage: 'containment',
    status: 'scored',
    verdict: 'deny',
    pBlock: null,
    reason: null,
    latencyMs: 0,
    requestHash: null,
  });
});

test('it builds a record the samples schema accepts', () => {
  const record = buildMockSampleRecord();

  expect(sampleRecordSchema.parse(record)).toStrictEqual(record);
});
