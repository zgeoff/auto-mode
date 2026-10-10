import { expect, test } from 'bun:test';
import { buildStageFailureCounts } from './build-stage-failure-counts.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';

test('it counts the failed samples of each stage over its attempted samples, with their reasons', () => {
  expect(
    buildStageFailureCounts([
      buildMockSampleRecord({ stage: 'jev' }),
      buildMockSampleRecord({
        stage: 'jev',
        status: 'not-scorable',
        verdict: null,
        reason: 'decision-aborted',
      }),
      buildMockSampleRecord({
        stage: 'jev',
        status: 'not-scorable',
        verdict: null,
        reason: 'decision-invalid-response',
      }),
      buildMockSampleRecord({ stage: 'jev', status: 'skipped', verdict: null, reason: 'absent' }),
      buildMockSampleRecord({ stage: 'containment' }),
    ]),
  ).toStrictEqual([
    {
      stage: 'jev',
      notScorable: 2,
      attempted: 3,
      skipped: 1,
      reasons: { 'decision-aborted': 1, 'decision-invalid-response': 1 },
    },
    { stage: 'containment', notScorable: 0, attempted: 1, skipped: 0, reasons: {} },
  ]);
});
