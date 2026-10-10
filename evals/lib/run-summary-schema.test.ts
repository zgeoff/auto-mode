import { expect, test } from 'bun:test';
import { runSummarySchema } from './run-summary-schema.ts';

test('it accepts a summary with its frozen config, counts and failures', () => {
  const payload = {
    runID: '20261010T120000Z-0a1b2c3d',
    config: {
      schemaVersion: 1,
      experiment: 'containment-replay',
      publicCommit: '8c52b93',
      policyHash: 'p',
      configuredRulesHash: 'r',
      corpusHash: 'c',
      labelsHash: 'l',
      model: 'jev-1.13.0',
      seed: 1,
      samples: 3,
      maxRequests: 100,
      live: true,
      startedAt: '2026-10-10T12:00:00.000Z',
      completedAt: '2026-10-10T12:05:00.000Z',
    },
    counts: [
      {
        measurement: 'catastrophic-allows',
        stage: 'jev',
        source: 'synthetic',
        unit: 'cases',
        events: 0,
        total: 26,
        cases: 26,
        wilson: { lower: 0, upper: 0.1288 },
        clopperPearson: { lower: 0, upper: 0.1323 },
        ruleOfThree: 0.1154,
        clusteredStandardError: null,
      },
    ],
    notScorable: [
      {
        stage: 'jev',
        notScorable: 1,
        attempted: 78,
        skipped: 0,
        reasons: { 'decision-aborted': 1 },
      },
    ],
  } as const;

  expect(runSummarySchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it rejects a config of another schema version', () => {
  const result = runSummarySchema.safeParse({
    runID: '20261010T120000Z-0a1b2c3d',
    config: {
      schemaVersion: 2,
      experiment: 'containment-replay',
      publicCommit: '8c52b93',
      policyHash: 'p',
      configuredRulesHash: 'r',
      corpusHash: 'c',
      labelsHash: 'l',
      model: null,
      seed: 1,
      samples: 3,
      maxRequests: null,
      live: false,
      startedAt: '2026-10-10T12:00:00.000Z',
      completedAt: null,
    },
    counts: [],
    notScorable: [],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['config', 'schemaVersion'] });
});

test('it rejects a count over a unit it does not define', () => {
  const result = runSummarySchema.safeParse({
    runID: '20261010T120000Z-0a1b2c3d',
    config: {
      schemaVersion: 1,
      experiment: 'containment-replay',
      publicCommit: '8c52b93',
      policyHash: 'p',
      configuredRulesHash: 'r',
      corpusHash: 'c',
      labelsHash: 'l',
      model: null,
      seed: 1,
      samples: 3,
      maxRequests: null,
      live: false,
      startedAt: '2026-10-10T12:00:00.000Z',
      completedAt: null,
    },
    counts: [
      {
        measurement: 'catastrophic-allows',
        stage: 'jev',
        source: 'synthetic',
        unit: 'samples',
        events: 0,
        total: 26,
        cases: 26,
        wilson: { lower: 0, upper: 0.1288 },
        clopperPearson: { lower: 0, upper: 0.1323 },
        ruleOfThree: 0.1154,
        clusteredStandardError: null,
      },
    ],
    notScorable: [],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['counts', 0, 'unit'] });
});
