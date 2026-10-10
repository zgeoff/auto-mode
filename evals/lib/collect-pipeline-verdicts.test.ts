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

test('it allows a denied sample when a reviewer overturns the deny', () => {
  expect(
    collectPipelineVerdicts(
      [
        buildMockSampleRecord({ caseKey: 'a', sample: 0, stage: 'jev', verdict: 'deny' }),
        buildMockSampleRecord({ caseKey: 'a', sample: 0, stage: 'judge', verdict: 'allow' }),
        buildMockSampleRecord({ caseKey: 'a', sample: 1, stage: 'jev', verdict: 'deny' }),
        buildMockSampleRecord({ caseKey: 'a', sample: 1, stage: 'judge', verdict: 'deny' }),
        buildMockSampleRecord({ caseKey: 'a', sample: 2, stage: 'jev', verdict: 'allow' }),
        buildMockSampleRecord({
          caseKey: 'a',
          sample: 2,
          stage: 'judge',
          status: 'skipped',
          verdict: null,
        }),
      ],
      ['judge'],
    ),
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
    {
      caseKey: 'a',
      labels: { severity: 'safe', consent: 'none', source: 'recorded' },
      sample: 2,
      verdict: 'allow',
    },
  ]);
});

test('it keeps a final stage deny when a reviewer allows the sample', () => {
  expect(
    collectPipelineVerdicts(
      [
        buildMockSampleRecord({ caseKey: 'a', stage: 'containment', verdict: 'deny' }),
        buildMockSampleRecord({ caseKey: 'a', stage: 'jev', verdict: 'deny' }),
        buildMockSampleRecord({ caseKey: 'a', stage: 'judge', verdict: 'allow' }),
      ],
      ['judge'],
      ['containment'],
    ),
  ).toStrictEqual([
    {
      caseKey: 'a',
      labels: { severity: 'safe', consent: 'none', source: 'recorded' },
      sample: 0,
      verdict: 'deny',
    },
  ]);
});

test('it lets a reviewer overturn a deny when the final stage allowed the sample', () => {
  expect(
    collectPipelineVerdicts(
      [
        buildMockSampleRecord({ caseKey: 'a', stage: 'containment', verdict: 'allow' }),
        buildMockSampleRecord({ caseKey: 'a', stage: 'jev', verdict: 'deny' }),
        buildMockSampleRecord({ caseKey: 'a', stage: 'judge', verdict: 'allow' }),
      ],
      ['judge'],
      ['containment'],
    ),
  ).toStrictEqual([
    {
      caseKey: 'a',
      labels: { severity: 'safe', consent: 'none', source: 'recorded' },
      sample: 0,
      verdict: 'allow',
    },
  ]);
});

test('it gives no verdict to a sample whose reviewer could not score it', () => {
  expect(
    collectPipelineVerdicts(
      [
        buildMockSampleRecord({ caseKey: 'a', stage: 'jev', verdict: 'deny' }),
        buildMockSampleRecord({
          caseKey: 'a',
          stage: 'judge',
          status: 'not-scorable',
          verdict: null,
        }),
      ],
      ['judge'],
    ),
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
