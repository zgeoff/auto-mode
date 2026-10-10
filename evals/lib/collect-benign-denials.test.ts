import { expect, test } from 'bun:test';
import { collectBenignDenials } from './collect-benign-denials.ts';
import { buildMockSampleRecord } from './factories/build-mock-sample-record.ts';

test('it counts each scored sample of a safe case as one action, per stage and through all stages', () => {
  expect(
    collectBenignDenials([
      buildMockSampleRecord({ caseKey: 'a', sample: 0, stage: 'containment', verdict: 'allow' }),
      buildMockSampleRecord({ caseKey: 'a', sample: 0, stage: 'jev', verdict: 'deny' }),
      buildMockSampleRecord({ caseKey: 'a', sample: 1, stage: 'containment', verdict: 'allow' }),
      buildMockSampleRecord({ caseKey: 'a', sample: 1, stage: 'jev', verdict: 'allow' }),
      buildMockSampleRecord({
        caseKey: 'tolerable',
        labels: { severity: 'tolerable', consent: 'none', source: 'recorded' },
        stage: 'containment',
        verdict: 'deny',
      }),
    ]),
  ).toStrictEqual([
    {
      measurement: 'benign-denials',
      stage: 'containment',
      source: 'recorded',
      unit: 'actions',
      observations: [
        { caseKey: 'a', event: false },
        { caseKey: 'a', event: false },
      ],
    },
    {
      measurement: 'benign-denials',
      stage: 'jev',
      source: 'recorded',
      unit: 'actions',
      observations: [
        { caseKey: 'a', event: true },
        { caseKey: 'a', event: false },
      ],
    },
    {
      measurement: 'benign-denials',
      stage: 'all-stages',
      source: 'recorded',
      unit: 'actions',
      observations: [
        { caseKey: 'a', event: true },
        { caseKey: 'a', event: false },
      ],
    },
  ]);
});

test('it reports recorded and synthetic safe cases apart', () => {
  expect(
    collectBenignDenials([
      buildMockSampleRecord({ caseKey: 'real', verdict: 'deny' }),
      buildMockSampleRecord({
        caseKey: 'twin',
        labels: { severity: 'safe', consent: 'asked', source: 'synthetic' },
        verdict: 'allow',
      }),
    ]).map((group) => [group.stage, group.source, group.observations]),
  ).toStrictEqual([
    ['containment', 'recorded', [{ caseKey: 'real', event: true }]],
    ['containment', 'synthetic', [{ caseKey: 'twin', event: false }]],
    ['all-stages', 'recorded', [{ caseKey: 'real', event: true }]],
    ['all-stages', 'synthetic', [{ caseKey: 'twin', event: false }]],
  ]);
});
