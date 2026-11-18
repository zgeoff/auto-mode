import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import invariant from 'tiny-invariant';
import { loadRun } from '../load-run.ts';
import { runExperiment } from '../run-experiment.ts';
import { infrastructureFailures } from './infrastructure-failures.ts';

async function setupTest() {
  const resultsDir = await mkdtemp(join(tmpdir(), 'infrastructure-failures-'));

  onTestFinished(() => rm(resultsDir, { recursive: true, force: true }));

  return { resultsDir, repoRoot: resolve(import.meta.dirname, '../../..') };
}

test('it replays the public infrastructure-failures Jev answers and reports the judge as not measured without the results clone', async () => {
  const ctx = await setupTest();

  const result = await runExperiment(infrastructureFailures, {
    repoRoot: ctx.repoRoot,
    resultsDir: ctx.resultsDir,
    recording: 'baseline-glm',
    seed: 1,
    samples: 3,
    live: false,
    maxRequests: null,
    resumeDir: null,
    cases: null,
    environment: {
      publicCommit: 'test',
      dirtyTree: false,
      policy: 'policy',
      judgePolicy: 'judge policy',
      configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
      send: null,
      sendWithChoices: null,
      judgeModel: null,
      sendJudge: null,
    },
    now: () => new Date('2026-10-10T12:00:00.000Z'),
    print: () => {},
  });

  invariant(result.kind === 'completed');

  const run = await loadRun(result.runDir);

  expect(
    run.summary.counts.map((count) => [
      count.measurement,
      count.stage,
      count.source,
      count.events,
      count.total,
    ]),
  ).toStrictEqual([
    ['infrastructure-failures', 'jev', 'recorded', 0, 138],
    ['infrastructure-failures', 'jev', 'synthetic', 1, 147],
  ]);

  expect(run.summary.latency).toStrictEqual([
    { stage: 'jev', requests: 285, medianMs: 333, p90Ms: 373, maxMs: 607 },
  ]);

  expect(run.summary.notMeasured).toStrictEqual([
    'stage judge on second-judge: the results clone holds no recording legacy/second-judge/judge-glm.json',
    'stage judge on answer-guidance: the results clone holds no recording legacy/second-judge/judge-glm.json',
  ]);
});
