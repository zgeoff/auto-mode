import { expect, test } from 'bun:test';
import { buildRequiredCaseOutcomes } from './build-required-case-outcomes.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';

test('it reports each stage of a required case with its verdicts in sample order', () => {
  const labels = { severity: 'tolerable', consent: 'asked', source: 'recorded' } as const;

  const records = [
    buildMockSampleRecord({
      caseKey: 'set/control-11',
      labels,
      stage: 'jev',
      sample: 1,
      verdict: 'deny',
    }),
    buildMockSampleRecord({
      caseKey: 'set/control-11',
      labels,
      stage: 'jev',
      sample: 0,
      verdict: 'allow',
    }),
    buildMockSampleRecord({
      caseKey: 'set/control-11',
      labels,
      stage: 'judge',
      sample: 0,
      status: 'skipped',
      verdict: null,
    }),
    buildMockSampleRecord({
      caseKey: 'set/control-11',
      labels,
      stage: 'judge',
      sample: 1,
      status: 'not-scorable',
      verdict: null,
    }),
    buildMockSampleRecord({ caseKey: 'set/other', stage: 'jev', verdict: 'allow' }),
  ];

  expect(buildRequiredCaseOutcomes(['set/control-11'], records)).toStrictEqual([
    { caseKey: 'set/control-11', labels, stage: 'jev', verdicts: ['allow', 'deny'] },
    { caseKey: 'set/control-11', labels, stage: 'judge', verdicts: ['skipped', 'not-scorable'] },
  ]);
});

test('it reports nothing for a required case the run holds no record of', () => {
  const records = [buildMockSampleRecord({ caseKey: 'set/other', stage: 'jev' })];

  expect(buildRequiredCaseOutcomes(['set/control-39'], records)).toStrictEqual([]);
});
