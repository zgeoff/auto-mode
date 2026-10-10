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
    },
  ]);
});

test('it clusters the error of a count over actions by case', () => {
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
      wilson: { lower: 0.15, upper: 0.85 },
      clopperPearson: { lower: 0.0676, upper: 0.9324 },
      ruleOfThree: null,
      clusteredStandardError: 0.5,
    },
  ]);
});
