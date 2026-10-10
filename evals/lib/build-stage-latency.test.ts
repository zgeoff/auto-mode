import { expect, test } from 'bun:test';
import { buildStageLatency } from './build-stage-latency.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';

test('it reports the nearest-rank median, 90th percentile and maximum of each stage that sent requests', () => {
  const records = [
    buildMockSampleRecord({ stage: 'jev', latencyMs: 300, requestHash: 'a' }),
    buildMockSampleRecord({ stage: 'jev', latencyMs: 100, requestHash: 'b' }),
    buildMockSampleRecord({
      stage: 'jev',
      latencyMs: 200,
      requestHash: 'c',
      status: 'not-scorable',
    }),
    buildMockSampleRecord({ stage: 'judge', latencyMs: 5000, answerHash: 'd' }),
  ];

  expect(buildStageLatency(records)).toStrictEqual([
    { stage: 'jev', requests: 3, medianMs: 200, p90Ms: 300, maxMs: 300 },
    { stage: 'judge', requests: 1, medianMs: 5000, p90Ms: 5000, maxMs: 5000 },
  ]);
});

test('it leaves out a replayed answer whose recording kept no latency', () => {
  const records = [
    buildMockSampleRecord({ stage: 'jev', latencyMs: null, answerHash: 'a' }),
    buildMockSampleRecord({ stage: 'jev', latencyMs: 400, answerHash: 'b' }),
  ];

  expect(buildStageLatency(records)).toStrictEqual([
    { stage: 'jev', requests: 1, medianMs: 400, p90Ms: 400, maxMs: 400 },
  ]);
});

test('it leaves out a deterministic stage that neither sent nor replayed a request', () => {
  const records = [
    buildMockSampleRecord({ stage: 'containment', latencyMs: 2 }),
    buildMockSampleRecord({ stage: 'jev', latencyMs: 300, requestHash: 'a' }),
  ];

  expect(buildStageLatency(records)).toStrictEqual([
    { stage: 'jev', requests: 1, medianMs: 300, p90Ms: 300, maxMs: 300 },
  ]);
});
