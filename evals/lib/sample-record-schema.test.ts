import { expect, test } from 'bun:test';
import { sampleRecordSchema } from './sample-record-schema.ts';

test('it accepts a scored sample with its labels, verdict and request hash', () => {
  const payload = {
    caseKey: 'T001',
    labels: { severity: 'safe', consent: 'none', source: 'recorded' },
    sample: 1,
    stage: 'jev',
    status: 'scored',
    verdict: 'deny',
    pBlock: 0.92,
    reason: 'Irreversible Local Destruction',
    latencyMs: 812,
    requestHash: 'ab12',
    answerHash: 'cd34',
  } as const;

  expect(sampleRecordSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it accepts a not-scorable sample with no verdict', () => {
  const payload = {
    caseKey: 'T001',
    labels: { severity: 'safe', consent: 'none', source: 'recorded' },
    sample: 0,
    stage: 'jev',
    status: 'not-scorable',
    verdict: null,
    pBlock: null,
    reason: 'decision-aborted',
    latencyMs: 30_000,
    requestHash: 'ab12',
    answerHash: 'cd34',
  } as const;

  expect(sampleRecordSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects a status outside the three it records', () => {
  const result = sampleRecordSchema.safeParse({
    caseKey: 'T001',
    labels: { severity: 'safe', consent: 'none', source: 'recorded' },
    sample: 0,
    stage: 'jev',
    status: 'failure',
    verdict: null,
    pBlock: null,
    reason: 'decision-aborted',
    latencyMs: 30_000,
    requestHash: 'ab12',
    answerHash: 'cd34',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['status'] });
});

test('it rejects a probability of block above one', () => {
  const result = sampleRecordSchema.safeParse({
    caseKey: 'T001',
    labels: { severity: 'safe', consent: 'none', source: 'recorded' },
    sample: 1,
    stage: 'jev',
    status: 'scored',
    verdict: 'deny',
    pBlock: 1.2,
    reason: 'Irreversible Local Destruction',
    latencyMs: 812,
    requestHash: 'ab12',
    answerHash: 'cd34',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['pBlock'] });
});

test('it rejects a sample record without an answer hash', () => {
  const result = sampleRecordSchema.safeParse({
    caseKey: 'T001',
    labels: { severity: 'safe', consent: 'none', source: 'recorded' },
    sample: 1,
    stage: 'jev',
    status: 'scored',
    verdict: 'deny',
    pBlock: 0.92,
    reason: 'Irreversible Local Destruction',
    latencyMs: 812,
    requestHash: 'ab12',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['answerHash'] });
});

test('it rejects a catastrophic label without its harm', () => {
  const result = sampleRecordSchema.safeParse({
    caseKey: 'T001',
    labels: { severity: 'catastrophic', consent: 'none', source: 'recorded' },
    sample: 1,
    stage: 'jev',
    status: 'scored',
    verdict: 'deny',
    pBlock: 0.92,
    reason: 'Irreversible Local Destruction',
    latencyMs: 812,
    requestHash: 'ab12',
    answerHash: 'cd34',
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['labels', 'harm'] });
});
