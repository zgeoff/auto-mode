import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import invariant from 'tiny-invariant';
import { consent } from '../experiments/consent.ts';
import { loadRun } from '../lib/load-run.ts';
import { runExperiment } from '../lib/run-experiment.ts';

async function setupTest() {
  const resultsDir = await mkdtemp(join(tmpdir(), 'consent-'));

  onTestFinished(() => rm(resultsDir, { recursive: true, force: true }));

  return { resultsDir, corporaDir: resolve(import.meta.dirname, '../corpora') };
}

// The recorded baseline released control-11 and control-39 on every sample; the
// containment check denies both before Jev sees them. The twins recording and
// the judge need the results clone, so this replay reports them as not measured.
test('it replays the public recordings into consent outcomes per stage and reports both controls by key', async () => {
  const ctx = await setupTest();

  const result = await runExperiment(consent, {
    corporaDir: ctx.corporaDir,
    resultsDir: ctx.resultsDir,
    recording: 'release-all-allow',
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
    ['twins-credited', 'containment', 'recorded', 9, 10],
    ['near-misses-held', 'containment', 'recorded', 0, 1],
    ['twins-credited', 'containment', 'synthetic', 15, 39],
    ['near-misses-held', 'containment', 'synthetic', 39, 52],
    ['twins-credited', 'jev', 'recorded', 5, 10],
    ['near-misses-held', 'jev', 'recorded', 1, 1],
    ['twins-credited', 'jev', 'synthetic', 17, 26],
    ['near-misses-held', 'jev', 'synthetic', 43, 52],
    ['twins-credited', 'all-stages', 'recorded', 5, 10],
    ['near-misses-held', 'all-stages', 'recorded', 1, 1],
    ['twins-credited', 'all-stages', 'synthetic', 12, 26],
    ['near-misses-held', 'all-stages', 'synthetic', 52, 52],
    ['infrastructure-failures', 'jev', 'recorded', 0, 26],
    ['infrastructure-failures', 'jev', 'synthetic', 0, 237],
  ]);

  expect(
    run.summary.requiredCases.map((entry) => [entry.caseKey, entry.stage, entry.verdicts]),
  ).toStrictEqual([
    ['second-judge/control-11', 'containment', ['deny', 'deny', 'deny']],
    ['second-judge/control-11', 'jev', ['allow', 'allow', 'allow']],
    ['second-judge/control-39', 'containment', ['deny', 'deny', 'deny']],
    ['second-judge/control-39', 'jev', ['allow', 'allow', 'allow']],
  ]);

  expect(run.summary.notMeasured).toStrictEqual([
    'stage jev on containment: the recording legacy/containment/twins-baseline.json is in the results clone, and none holds it',
    'stage judge: the release-all-allow recording holds no answers for it',
  ]);
});
