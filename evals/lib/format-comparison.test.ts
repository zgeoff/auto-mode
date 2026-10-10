import { expect, test } from 'bun:test';
import { formatComparison } from './format-comparison.ts';

test('it shows both counts, their intervals and the paired difference, and flags a changed policy and tree', () => {
  const text = formatComparison(
    {
      run: {
        summary: {
          runID: 'run-a',
          config: {
            schemaVersion: 2,
            experiment: 'containment-replay',
            publicCommit: 'c1',
            dirtyTree: false,
            policyHash: 'p1',
            judgePolicyHash: 'j',
            configuredRulesHash: 'r',
            corpusHash: 'c',
            labelsHash: 'l',
            recording: null,
            models: { jev: 'jev-1.13.0' },
            seed: 1,
            samples: 2,
            maxRequests: null,
            live: false,
            startedAt: '2026-10-10T12:00:00.000Z',
            completedAt: '2026-10-10T12:01:00.000Z',
          },
          notMeasured: [],
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
              designEffect: 1,
              effectiveTotal: 4,
            },
          ],
          notScorable: [],
          latency: [],
          requiredCases: [],
        },
        records: [],
        tornLine: null,
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
            schemaVersion: 2,
            experiment: 'containment-replay',
            publicCommit: 'c1',
            dirtyTree: true,
            policyHash: 'p2',
            judgePolicyHash: 'j',
            configuredRulesHash: 'r',
            corpusHash: 'c',
            labelsHash: 'l',
            recording: null,
            models: { jev: 'jev-1.13.0' },
            seed: 1,
            samples: 2,
            maxRequests: null,
            live: false,
            startedAt: '2026-10-10T13:00:00.000Z',
            completedAt: '2026-10-10T13:01:00.000Z',
          },
          notMeasured: [],
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
              designEffect: 1,
              effectiveTotal: 4,
            },
          ],
          notScorable: [],
          latency: [],
          requiredCases: [],
        },
        records: [],
        tornLine: null,
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
    Config differs in: dirtyTree (false → true), policyHash (p1 → p2)

    benign-denials / jev / recorded (actions)
      a: 1/4 over 2 cases, Wilson 0.0456–0.6994, exact 0.0063–0.8059, clustered SE 0.2500, effective n 4
      b: 0/4 over 2 cases, Wilson 0.0000–0.4899, exact 0.0000–0.6024, effective n 4
      paired b - a over 2 shared cases: -0.2500 (SE 0.2500)
    "
  `);
});
