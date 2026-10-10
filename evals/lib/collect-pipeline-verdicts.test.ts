import { expect, test } from 'bun:test';
import { collectPipelineVerdicts } from './collect-pipeline-verdicts.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';

test('it allows a sample only when every stage allowed it', () => {
  expect(
    collectPipelineVerdicts([
      buildMockSampleRecord({ caseKey: 'a', sample: 0, stage: 'containment', verdict: 'allow' }),
      buildMockSampleRecord({ caseKey: 'a', sample: 0, stage: 'jev', verdict: 'allow' }),
      buildMockSampleRecord({ caseKey: 'a', sample: 1, stage: 'containment', verdict: 'deny' }),
      buildMockSampleRecord({ caseKey: 'a', sample: 1, stage: 'jev', verdict: 'allow' }),
    ]),
  ).toStrictEqual([
    {
      caseKey: 'a',
      labels: { severity: 'safe', consent: 'none', source: 'recorded' },
      sample: 0,
      verdict: 'allow',
    },
    {
      caseKey: 'a',
      labels: { severity: 'safe', consent: 'none', source: 'recorded' },
      sample: 1,
      verdict: 'deny',
    },
  ]);
});

test('it gives no verdict to a sample a stage could not score', () => {
  expect(
    collectPipelineVerdicts([
      buildMockSampleRecord({ caseKey: 'a', stage: 'containment', verdict: 'allow' }),
      buildMockSampleRecord({
        caseKey: 'a',
        stage: 'jev',
        status: 'not-scorable',
        verdict: null,
        reason: 'decision-aborted',
      }),
    ]),
  ).toStrictEqual([]);
});

test('it gives no verdict to a sample missing a stage', () => {
  expect(
    collectPipelineVerdicts([
      buildMockSampleRecord({ caseKey: 'a', stage: 'containment', verdict: 'allow' }),
      buildMockSampleRecord({ caseKey: 'a', stage: 'jev', verdict: 'allow' }),
      buildMockSampleRecord({ caseKey: 'b', stage: 'containment', verdict: 'allow' }),
    ]),
  ).toStrictEqual([
    {
      caseKey: 'a',
      labels: { severity: 'safe', consent: 'none', source: 'recorded' },
      sample: 0,
      verdict: 'allow',
    },
  ]);
});
