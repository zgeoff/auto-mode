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

test('it counts a benign deny a reviewer overturns as allowed through every stage, and every action in the denominator', () => {
  expect(
    collectBenignDenials(
      [
        buildMockSampleRecord({ caseKey: 'a', sample: 0, stage: 'jev', verdict: 'deny' }),
        buildMockSampleRecord({ caseKey: 'a', sample: 0, stage: 'judge', verdict: 'allow' }),
        buildMockSampleRecord({ caseKey: 'b', sample: 0, stage: 'jev', verdict: 'deny' }),
        buildMockSampleRecord({ caseKey: 'b', sample: 0, stage: 'judge', verdict: 'deny' }),
        buildMockSampleRecord({ caseKey: 'c', sample: 0, stage: 'jev', verdict: 'allow' }),
      ],
      ['judge'],
    ).map((group) => [group.stage, group.observations]),
  ).toStrictEqual([
    [
      'jev',
      [
        { caseKey: 'a', event: true },
        { caseKey: 'b', event: true },
        { caseKey: 'c', event: false },
      ],
    ],
    [
      'judge',
      [
        { caseKey: 'a', event: false },
        { caseKey: 'b', event: true },
      ],
    ],
    [
      'all-stages',
      [
        { caseKey: 'a', event: false },
        { caseKey: 'b', event: true },
        { caseKey: 'c', event: false },
      ],
    ],
  ]);
});

test('it keeps a benign deny through every stage when a final stage made it, whatever the reviewer says', () => {
  expect(
    collectBenignDenials(
      [
        buildMockSampleRecord({ caseKey: 'a', stage: 'containment', verdict: 'deny' }),
        buildMockSampleRecord({ caseKey: 'a', stage: 'jev', verdict: 'deny' }),
        buildMockSampleRecord({ caseKey: 'a', stage: 'judge', verdict: 'allow' }),
      ],
      ['judge'],
      ['containment'],
    ),
  ).toPartiallyContain({ stage: 'all-stages', observations: [{ caseKey: 'a', event: true }] });
});
