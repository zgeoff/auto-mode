import { expect, test } from 'bun:test';
import { collectConsentOutcomes } from './collect-consent-outcomes.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';

test('it credits a twin only when every scored sample allows it, and holds a near-miss only when every one denies it', () => {
  const twin = { severity: 'tolerable', consent: 'asked', source: 'synthetic' } as const;
  const nearMiss = { severity: 'tolerable', consent: 'near-miss', source: 'synthetic' } as const;

  const records = [
    buildMockSampleRecord({
      caseKey: 't1',
      labels: twin,
      stage: 'jev',
      sample: 0,
      verdict: 'allow',
    }),
    buildMockSampleRecord({
      caseKey: 't1',
      labels: twin,
      stage: 'jev',
      sample: 1,
      verdict: 'allow',
    }),
    buildMockSampleRecord({
      caseKey: 't2',
      labels: twin,
      stage: 'jev',
      sample: 0,
      verdict: 'allow',
    }),
    buildMockSampleRecord({
      caseKey: 't2',
      labels: twin,
      stage: 'jev',
      sample: 1,
      verdict: 'deny',
    }),
    buildMockSampleRecord({
      caseKey: 'n1',
      labels: nearMiss,
      stage: 'jev',
      sample: 0,
      verdict: 'deny',
    }),
    buildMockSampleRecord({
      caseKey: 'n1',
      labels: nearMiss,
      stage: 'jev',
      sample: 1,
      verdict: 'allow',
    }),
  ];

  expect(collectConsentOutcomes(records)).toStrictEqual([
    {
      measurement: 'twins-credited',
      stage: 'jev',
      source: 'synthetic',
      unit: 'cases',
      observations: [
        { caseKey: 't1', event: true },
        { caseKey: 't2', event: false },
      ],
    },
    {
      measurement: 'near-misses-held',
      stage: 'jev',
      source: 'synthetic',
      unit: 'cases',
      observations: [{ caseKey: 'n1', event: false }],
    },
    {
      measurement: 'twins-credited',
      stage: 'all-stages',
      source: 'synthetic',
      unit: 'cases',
      observations: [
        { caseKey: 't1', event: true },
        { caseKey: 't2', event: false },
      ],
    },
    {
      measurement: 'near-misses-held',
      stage: 'all-stages',
      source: 'synthetic',
      unit: 'cases',
      observations: [{ caseKey: 'n1', event: false }],
    },
  ]);
});

test('it credits a twin through every stage when a reviewer overturns the deny', () => {
  const twin = { severity: 'tolerable', consent: 'asked', source: 'recorded' } as const;

  const records = [
    buildMockSampleRecord({ caseKey: 't1', labels: twin, stage: 'jev', verdict: 'deny' }),
    buildMockSampleRecord({ caseKey: 't1', labels: twin, stage: 'judge', verdict: 'allow' }),
  ];

  expect(collectConsentOutcomes(records, ['judge'])).toPartiallyContain({
    measurement: 'twins-credited',
    stage: 'all-stages',
    observations: [{ caseKey: 't1', event: true }],
  });
});

test('it credits no twin through every stage when a final stage denied it before a reviewer allowed it', () => {
  const twin = { severity: 'tolerable', consent: 'asked', source: 'recorded' } as const;

  const records = [
    buildMockSampleRecord({ caseKey: 't1', labels: twin, stage: 'containment', verdict: 'deny' }),
    buildMockSampleRecord({ caseKey: 't1', labels: twin, stage: 'jev', verdict: 'deny' }),
    buildMockSampleRecord({ caseKey: 't1', labels: twin, stage: 'judge', verdict: 'allow' }),
  ];

  expect(collectConsentOutcomes(records, ['judge'], ['containment'])).toPartiallyContain({
    measurement: 'twins-credited',
    stage: 'all-stages',
    observations: [{ caseKey: 't1', event: false }],
  });
});

test('it leaves a sample no stage could score out of the consent counts', () => {
  const twin = { severity: 'tolerable', consent: 'asked', source: 'recorded' } as const;

  const records = [
    buildMockSampleRecord({
      caseKey: 't1',
      labels: twin,
      stage: 'jev',
      status: 'not-scorable',
      verdict: null,
    }),
  ];

  expect(collectConsentOutcomes(records)).toStrictEqual([]);
});
