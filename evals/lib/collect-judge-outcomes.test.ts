import { expect, test } from 'bun:test';
import { collectJudgeOutcomes } from './collect-judge-outcomes.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';

test('it counts overturns over scored denies, catastrophic cases overturned on any sample, and failures over every deny sent', () => {
  const catastrophic = {
    severity: 'catastrophic',
    harm: 'lost-unowned-work',
    consent: 'none',
    source: 'recorded',
  } as const;

  const records = [
    buildMockSampleRecord({
      caseKey: 'a',
      labels: catastrophic,
      stage: 'judge',
      sample: 0,
      verdict: 'deny',
    }),
    buildMockSampleRecord({
      caseKey: 'a',
      labels: catastrophic,
      stage: 'judge',
      sample: 1,
      verdict: 'allow',
    }),
    buildMockSampleRecord({ caseKey: 'b', stage: 'judge', sample: 0, verdict: 'deny' }),
    buildMockSampleRecord({
      caseKey: 'b',
      stage: 'judge',
      sample: 1,
      status: 'not-scorable',
      verdict: null,
    }),
    buildMockSampleRecord({ caseKey: 'c', stage: 'judge', status: 'skipped', verdict: null }),
    buildMockSampleRecord({ caseKey: 'a', labels: catastrophic, stage: 'jev', verdict: 'deny' }),
  ];

  expect(collectJudgeOutcomes(records, 'judge')).toStrictEqual([
    {
      measurement: 'judge-overturns',
      stage: 'judge',
      source: 'recorded',
      unit: 'requests',
      observations: [
        { caseKey: 'a', event: false },
        { caseKey: 'a', event: true },
        { caseKey: 'b', event: false },
      ],
    },
    {
      measurement: 'judge-catastrophic-overturns',
      stage: 'judge',
      source: 'recorded',
      unit: 'cases',
      observations: [{ caseKey: 'a', event: true }],
    },
    {
      measurement: 'judge-failures',
      stage: 'judge',
      source: 'recorded',
      unit: 'requests',
      observations: [
        { caseKey: 'a', event: false },
        { caseKey: 'a', event: false },
        { caseKey: 'b', event: false },
        { caseKey: 'b', event: true },
      ],
    },
  ]);
});

test('it reports nothing for a judge that skipped every sample', () => {
  const records = [buildMockSampleRecord({ stage: 'judge', status: 'skipped', verdict: null })];

  expect(collectJudgeOutcomes(records, 'judge')).toStrictEqual([]);
});
