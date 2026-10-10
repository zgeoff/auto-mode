import { expect, test } from 'bun:test';
import { buildMeasurementCounts } from './build-measurement-counts.ts';

test('it bounds zero events over distinct cases by the rule of three', () => {
  expect(
    buildMeasurementCounts([
      {
        measurement: 'catastrophic-allows',
        stage: 'jev',
        source: 'synthetic',
        unit: 'cases',
        observations: Array.from({ length: 10 }, (_, index) => ({
          caseKey: `c${index}`,
          event: false,
        })),
      },
    ]),
  ).toStrictEqual([
    {
      measurement: 'catastrophic-allows',
      stage: 'jev',
      source: 'synthetic',
      unit: 'cases',
      events: 0,
      total: 10,
      cases: 10,
      wilson: { lower: 0, upper: 0.2775 },
      clopperPearson: { lower: 0, upper: 0.3085 },
      ruleOfThree: 0.3,
      clusteredStandardError: null,
      designEffect: null,
      effectiveTotal: null,
    },
  ]);
});

test('it widens the intervals of a count over actions to one effective action per wholly split case', () => {
  expect(
    buildMeasurementCounts([
      {
        measurement: 'benign-denials',
        stage: 'jev',
        source: 'recorded',
        unit: 'actions',
        observations: [
          { caseKey: 'a', event: true },
          { caseKey: 'a', event: true },
          { caseKey: 'b', event: false },
          { caseKey: 'b', event: false },
        ],
      },
    ]),
  ).toStrictEqual([
    {
      measurement: 'benign-denials',
      stage: 'jev',
      source: 'recorded',
      unit: 'actions',
      events: 2,
      total: 4,
      cases: 2,
      wilson: { lower: 0.0546, upper: 0.9454 },
      clopperPearson: { lower: 0.0004, upper: 0.9996 },
      ruleOfThree: null,
      clusteredStandardError: 0.5,
      designEffect: 4,
      effectiveTotal: 1,
    },
  ]);
});

test('it keeps the intervals of a count over requests whose samples vary inside each case', () => {
  expect(
    buildMeasurementCounts([
      {
        measurement: 'infrastructure-failures',
        stage: 'judge',
        source: 'synthetic',
        unit: 'requests',
        observations: [
          { caseKey: 'a', event: true },
          { caseKey: 'a', event: false },
          { caseKey: 'b', event: true },
          { caseKey: 'b', event: false },
          { caseKey: 'c', event: false },
          { caseKey: 'c', event: false },
        ],
      },
    ]),
  ).toStrictEqual([
    {
      measurement: 'infrastructure-failures',
      stage: 'judge',
      source: 'synthetic',
      unit: 'requests',
      events: 2,
      total: 6,
      cases: 3,
      wilson: { lower: 0.0968, upper: 0.7 },
      clopperPearson: { lower: 0.0433, upper: 0.7772 },
      ruleOfThree: null,
      clusteredStandardError: 0.1667,
      designEffect: 1,
      effectiveTotal: 6,
    },
  ]);
});
