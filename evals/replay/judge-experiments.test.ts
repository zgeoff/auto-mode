import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import invariant from 'tiny-invariant';
import { infrastructureFailures } from '../experiments/infrastructure-failures.ts';
import { judgeAlone } from '../experiments/judge-alone.ts';
import { loadRun } from '../lib/load-run.ts';
import { runExperiment } from '../lib/run-experiment.ts';

async function setupTest() {
  const resultsDir = await mkdtemp(join(tmpdir(), 'judge-experiments-'));

  onTestFinished(() => rm(resultsDir, { recursive: true, force: true }));

  return { resultsDir, corporaDir: resolve(import.meta.dirname, '../corpora') };
}

// The judge replies live in the results clone, so without it only the public
// Jev answers replay: the baseline run had one invalid response in 285 requests.
test.each([
  ['judge-alone', judgeAlone],
  ['infrastructure-failures', infrastructureFailures],
])(
  'it replays the public %s Jev answers and reports the judge as not measured without the results clone',
  async (_name, experiment) => {
    const ctx = await setupTest();

    const result = await runExperiment(experiment, {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: 'baseline-glm',
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
      'stage judge on second-judge: the recording legacy/second-judge/judge-glm.json is in the results clone, and none holds it',
      'stage judge on answer-guidance: the recording legacy/second-judge/judge-glm.json is in the results clone, and none holds it',
    ]);
  },
);
