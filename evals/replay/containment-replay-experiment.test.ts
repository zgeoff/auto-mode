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
    seed: 1,
    samples: 3,
    live: false,
    maxRequests: null,
    resumeDir: null,
    environment: { publicCommit: 'test', policy: 'policy', configuredRules: {}, send: null },
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
    },
    {
      measurement: 'benign-denials',
      stage: 'containment',
      source: 'recorded',
      unit: 'actions',
      events: 16,
      total: 452,
      cases: 226,
      wilson: { lower: 0.0219, upper: 0.0567 },
      clopperPearson: { lower: 0.0204, upper: 0.0568 },
      ruleOfThree: null,
      clusteredStandardError: 0.0123,
    },
    {
      measurement: 'benign-denials',
      stage: 'containment',
      source: 'synthetic',
      unit: 'actions',
      events: 30,
      total: 75,
      cases: 25,
      wilson: { lower: 0.2966, upper: 0.5131 },
      clopperPearson: { lower: 0.2885, upper: 0.5196 },
      ruleOfThree: null,
      clusteredStandardError: 0.1,
    },
    {
      measurement: 'benign-denials',
      stage: 'jev-recorded',
      source: 'recorded',
      unit: 'actions',
      events: 31,
      total: 452,
      cases: 226,
      wilson: { lower: 0.0487, upper: 0.0957 },
      clopperPearson: { lower: 0.0471, upper: 0.0959 },
      ruleOfThree: null,
      clusteredStandardError: 0.0164,
    },
    {
      measurement: 'benign-denials',
      stage: 'jev-recorded',
      source: 'synthetic',
      unit: 'actions',
      events: 20,
      total: 75,
      cases: 25,
      wilson: { lower: 0.1798, upper: 0.3763 },
      clopperPearson: { lower: 0.1711, upper: 0.3814 },
      ruleOfThree: null,
      clusteredStandardError: 0.0839,
    },
    {
      measurement: 'benign-denials',
      stage: 'all-stages',
      source: 'recorded',
      unit: 'actions',
      events: 37,
      total: 452,
      cases: 226,
      wilson: { lower: 0.06, upper: 0.1108 },
      clopperPearson: { lower: 0.0583, upper: 0.1111 },
      ruleOfThree: null,
      clusteredStandardError: 0.0179,
    },
    {
      measurement: 'benign-denials',
      stage: 'all-stages',
      source: 'synthetic',
      unit: 'actions',
      events: 36,
      total: 75,
      cases: 25,
      wilson: { lower: 0.3707, upper: 0.5913 },
      clopperPearson: { lower: 0.3631, upper: 0.5985 },
      ruleOfThree: null,
      clusteredStandardError: 0.0983,
    },
  ]);

  expect(run.summary.notScorable).toStrictEqual([
    { stage: 'containment', notScorable: 0, attempted: 620, skipped: 232, reasons: {} },
    { stage: 'jev-recorded', notScorable: 0, attempted: 620, skipped: 232, reasons: {} },
  ]);
});
