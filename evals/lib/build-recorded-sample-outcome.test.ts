import { expect, test } from 'bun:test';
import { buildRecordedSampleOutcome } from './build-recorded-sample-outcome.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';

test('it replays a scored sample with its verdict, block probability, reason and latency', () => {
  const record = buildMockSampleRecord({
    stage: 'jev',
    status: 'scored',
    verdict: 'deny',
    pBlock: 0.82,
    reason: 'deny: Irreversible Deletion',
    latencyMs: 340,
  });

  expect(buildRecordedSampleOutcome(record, 'jev-model')).toStrictEqual({
    status: 'scored',
    verdict: 'deny',
    pBlock: 0.82,
    reason: 'deny: Irreversible Deletion',
    recorded: { answer: record, latencyMs: 340, model: 'jev-model' },
  });
});

test('it replays a not scorable sample with its reason', () => {
  const record = buildMockSampleRecord({
    stage: 'judge',
    status: 'not-scorable',
    verdict: null,
    reason: 'judge-unreadable',
    latencyMs: 9000,
  });

  expect(buildRecordedSampleOutcome(record, 'judge-model')).toStrictEqual({
    status: 'not-scorable',
    reason: 'judge-unreadable',
    recorded: { answer: record, latencyMs: 9000, model: 'judge-model' },
  });
});

test('it replays a skipped sample with its reason', () => {
  const record = buildMockSampleRecord({
    stage: 'judge',
    status: 'skipped',
    verdict: null,
    reason: 'Jev did not deny this sample.',
    latencyMs: null,
  });

  expect(buildRecordedSampleOutcome(record, 'judge-model')).toStrictEqual({
    status: 'skipped',
    reason: 'Jev did not deny this sample.',
    recorded: { answer: record, latencyMs: null, model: 'judge-model' },
  });
});

test('it replays a sample recorded without a reason as an unknown reason', () => {
  const record = buildMockSampleRecord({
    stage: 'judge',
    status: 'not-scorable',
    verdict: null,
    reason: null,
    latencyMs: 0,
  });

  expect(buildRecordedSampleOutcome(record, 'judge-model')).toStrictEqual({
    status: 'not-scorable',
    reason: 'unknown',
    recorded: { answer: record, latencyMs: 0, model: 'judge-model' },
  });
});

test('it refuses a scored sample recorded without a verdict', () => {
  const record = buildMockSampleRecord({
    caseKey: 'second-judge/control-39',
    stage: 'judge',
    status: 'scored',
    verdict: null,
  });

  expect(() => buildRecordedSampleOutcome(record, 'judge-model')).toThrowWithMessage(
    Error,
    'The recorded judge sample of second-judge/control-39 holds no verdict.',
  );
});
