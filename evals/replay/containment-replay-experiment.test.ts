import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import invariant from 'tiny-invariant';
import { containmentReplay } from '../experiments/containment-replay.ts';
import { loadRun } from '../lib/load-run.ts';
import { runExperiment } from '../lib/run-experiment.ts';

async function setupTest() {
  const resultsDir = await mkdtemp(join(tmpdir(), 'containment-replay-'));

  onTestFinished(() => rm(resultsDir, { recursive: true, force: true }));

  return { resultsDir, corporaDir: resolve(import.meta.dirname, '../corpora') };
}

test('it replays the recorded answers and the containment check offline into the exact counts', async () => {
  const ctx = await setupTest();

  const result = await runExperiment(containmentReplay, {
    corporaDir: ctx.corporaDir,
    resultsDir: ctx.resultsDir,
    recording: null,
    seed: 1,
    samples: 3,
    live: false,
    maxRequests: null,
    resumeDir: null,
    environment: {
      publicCommit: 'test',
      dirtyTree: false,
      policy: 'policy',
      judgePolicy: 'judge policy',
      configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
      send: null,
      sendWithChoices: null,
      sendJudge: null,
    },
    now: () => new Date('2026-10-10T12:00:00.000Z'),
    print: () => {},
  });

  invariant(result.kind === 'completed');

  const run = await loadRun(result.runDir);

  expect(run.summary.counts).toStrictEqual([
    {
      measurement: 'catastrophic-allows',
      stage: 'containment',
      source: 'synthetic',
      unit: 'cases',
      events: 11,
      total: 26,
      cases: 26,
      wilson: { lower: 0.2554, upper: 0.6105 },
      clopperPearson: { lower: 0.2335, upper: 0.6308 },
      ruleOfThree: null,
      clusteredStandardError: null,
      designEffect: null,
      effectiveTotal: null,
    },
    {
      measurement: 'catastrophic-allows',
      stage: 'jev-recorded',
      source: 'synthetic',
      unit: 'cases',
      events: 2,
      total: 26,
      cases: 26,
      wilson: { lower: 0.0214, upper: 0.2414 },
      clopperPearson: { lower: 0.0095, upper: 0.2513 },
      ruleOfThree: null,
      clusteredStandardError: null,
      designEffect: null,
      effectiveTotal: null,
    },
    {
      measurement: 'catastrophic-allows',
      stage: 'all-stages',
      source: 'synthetic',
      unit: 'cases',
      events: 0,
      total: 26,
      cases: 26,
      wilson: { lower: 0, upper: 0.1287 },
      clopperPearson: { lower: 0, upper: 0.1323 },
      ruleOfThree: 0.1154,
      clusteredStandardError: null,
      designEffect: null,
      effectiveTotal: null,
    },
    {
      measurement: 'benign-denials',
      stage: 'containment',
      source: 'recorded',
      unit: 'actions',
      events: 16,
      total: 452,
      cases: 226,
      wilson: { lower: 0.018, upper: 0.0684 },
      clopperPearson: { lower: 0.0154, upper: 0.0687 },
      ruleOfThree: null,
      clusteredStandardError: 0.0123,
      designEffect: 2.0089,
      effectiveTotal: 225,
    },
    {
      measurement: 'benign-denials',
      stage: 'containment',
      source: 'synthetic',
      unit: 'actions',
      events: 30,
      total: 75,
      cases: 25,
      wilson: { lower: 0.2313, upper: 0.5963 },
      clopperPearson: { lower: 0.2077, upper: 0.6179 },
      ruleOfThree: null,
      clusteredStandardError: 0.1,
      designEffect: 3.125,
      effectiveTotal: 24,
    },
    {
      measurement: 'benign-denials',
      stage: 'jev-recorded',
      source: 'recorded',
      unit: 'actions',
      events: 31,
      total: 452,
      cases: 226,
      wilson: { lower: 0.0428, upper: 0.1081 },
      clopperPearson: { lower: 0.0399, upper: 0.1086 },
      ruleOfThree: null,
      clusteredStandardError: 0.0164,
      designEffect: 1.9045,
      effectiveTotal: 237.3293,
    },
    {
      measurement: 'benign-denials',
      stage: 'jev-recorded',
      source: 'synthetic',
      unit: 'actions',
      events: 20,
      total: 75,
      cases: 25,
      wilson: { lower: 0.1383, upper: 0.4517 },
      clopperPearson: { lower: 0.1181, upper: 0.4674 },
      ruleOfThree: null,
      clusteredStandardError: 0.0839,
      designEffect: 2.6989,
      effectiveTotal: 27.7895,
    },
    {
      measurement: 'benign-denials',
      stage: 'all-stages',
      source: 'recorded',
      unit: 'actions',
      events: 37,
      total: 452,
      cases: 226,
      wilson: { lower: 0.0532, upper: 0.124 },
      clopperPearson: { lower: 0.0502, upper: 0.1245 },
      ruleOfThree: null,
      clusteredStandardError: 0.0179,
      designEffect: 1.9202,
      effectiveTotal: 235.3938,
    },
    {
      measurement: 'benign-denials',
      stage: 'all-stages',
      source: 'synthetic',
      unit: 'actions',
      events: 36,
      total: 75,
      cases: 25,
      wilson: { lower: 0.3028, upper: 0.6623 },
      clopperPearson: { lower: 0.2812, upper: 0.6836 },
      ruleOfThree: null,
      clusteredStandardError: 0.0983,
      designEffect: 2.9024,
      effectiveTotal: 25.8405,
    },
  ]);

  expect(run.summary.notScorable).toStrictEqual([
    { stage: 'containment', notScorable: 0, attempted: 620, skipped: 232, reasons: {} },
    { stage: 'jev-recorded', notScorable: 0, attempted: 620, skipped: 232, reasons: {} },
  ]);
});
