import { expect, test } from 'bun:test';
import { formatComparison } from './format-comparison.ts';

test('it shows both counts, their intervals and the paired difference, and flags a changed policy', () => {
  const text = formatComparison(
    {
      run: {
        summary: {
          runID: 'run-a',
          config: {
            schemaVersion: 1,
            experiment: 'containment-replay',
            publicCommit: 'c1',
            policyHash: 'p1',
            configuredRulesHash: 'r',
            corpusHash: 'c',
            labelsHash: 'l',
            model: null,
            seed: 1,
            samples: 2,
            maxRequests: null,
            live: false,
            startedAt: '2026-10-10T12:00:00.000Z',
            completedAt: '2026-10-10T12:01:00.000Z',
          },
          counts: [
            {
              measurement: 'benign-denials',
              stage: 'jev',
              source: 'recorded',
              unit: 'actions',
              events: 1,
              total: 4,
              cases: 2,
              wilson: { lower: 0.0456, upper: 0.6994 },
              clopperPearson: { lower: 0.0063, upper: 0.8059 },
              ruleOfThree: null,
              clusteredStandardError: 0.25,
            },
          ],
          notScorable: [],
        },
        records: [],
      },
      observations: [
        {
          measurement: 'benign-denials',
          stage: 'jev',
          source: 'recorded',
          unit: 'actions',
          observations: [
            { caseKey: 'a', event: true },
            { caseKey: 'a', event: false },
            { caseKey: 'b', event: false },
            { caseKey: 'b', event: false },
          ],
        },
      ],
    },
    {
      run: {
        summary: {
          runID: 'run-b',
          config: {
            schemaVersion: 1,
            experiment: 'containment-replay',
            publicCommit: 'c1',
            policyHash: 'p2',
            configuredRulesHash: 'r',
            corpusHash: 'c',
            labelsHash: 'l',
            model: null,
            seed: 1,
            samples: 2,
            maxRequests: null,
            live: false,
            startedAt: '2026-10-10T13:00:00.000Z',
            completedAt: '2026-10-10T13:01:00.000Z',
          },
          counts: [
            {
              measurement: 'benign-denials',
              stage: 'jev',
              source: 'recorded',
              unit: 'actions',
              events: 0,
              total: 4,
              cases: 2,
              wilson: { lower: 0, upper: 0.4899 },
              clopperPearson: { lower: 0, upper: 0.6024 },
              ruleOfThree: null,
              clusteredStandardError: null,
            },
          ],
          notScorable: [],
        },
        records: [],
      },
      observations: [
        {
          measurement: 'benign-denials',
          stage: 'jev',
          source: 'recorded',
          unit: 'actions',
          observations: [
            { caseKey: 'a', event: false },
            { caseKey: 'a', event: false },
            { caseKey: 'b', event: false },
            { caseKey: 'b', event: false },
          ],
        },
      ],
    },
  );

  expect(text).toMatchInlineSnapshot(`
    "Experiment: containment-replay
    a: run-a
    b: run-b
    Config differs in: policyHash (p1 → p2)

    benign-denials / jev / recorded (actions)
      a: 1/4 over 2 cases, Wilson 0.0456–0.6994, exact 0.0063–0.8059, clustered SE 0.2500
      b: 0/4 over 2 cases, Wilson 0.0000–0.4899, exact 0.0000–0.6024
      paired b - a over 2 shared cases: -0.2500 (SE 0.2500)
    "
  `);
});
