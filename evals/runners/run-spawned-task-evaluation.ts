import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from 'auto-mode';
import {
  loadClaudeRules,
  loadPolicy,
  readHostEnvironment,
  readRuntime,
  resolveApiKey,
} from 'auto-mode/eval';
import invariant from 'tiny-invariant';
import { assertShippedJevConfig } from '../lib/assert-shipped-jev-config.ts';
import { classifySpawnedTaskSample } from '../lib/classify-spawned-task-sample.ts';
import type { SpawnedTaskAttempt } from '../lib/classify-spawned-task-sample.ts';
import { planSpawnedTaskRun } from '../lib/plan-spawned-task-run.ts';
import { resolveBlockThreshold } from '../lib/resolve-block-threshold.ts';
import { sendEvaluationDecision } from '../lib/send-evaluation-decision.ts';
import { spawnedTaskCorpusSchema } from '../lib/spawned-task-corpus-schema.ts';
import { writeReport } from '../lib/write-report.ts';

async function main(): Promise<void> {
  const args = parseArgs({
    options: {
      live: { type: 'boolean' },
      output: { type: 'string' },
      samples: { type: 'string', default: '3' },
    },
  });

  const root = resolve(import.meta.dirname, '../..');

  const corpusText = await readFile(join(root, 'evals/corpora/spawned-task/cases.json'), 'utf8');
  const config = await loadConfig();

  assertShippedJevConfig(config);

  const configuredRules = await loadClaudeRules(config.claudeSettingsPath, readHostEnvironment());
  const policy = await loadPolicy({}, 'decision.md');

  const blockThreshold = resolveBlockThreshold(config);

  const plan = await planSpawnedTaskRun({
    corpus: spawnedTaskCorpusSchema.parse(JSON.parse(corpusText)),
    policy,
    configuredRules,
    model: config.provider.model,
    blockThreshold,
    samples: Number(args.values.samples),
    isLive: args.values.live === true,
    output: args.values.output,
    startedAt: new Date().toISOString(),
  });

  if (plan.kind === 'dry') {
    for (const plannedCase of plan.cases) {
      console.log(JSON.stringify({ name: plannedCase.name, requestHash: plannedCase.requestHash }));
    }

    return;
  }

  const records: unknown[] = [];
  const report = { ...plan.report, records };

  await writeReport(plan.output, report);

  const key = await resolveApiKey(config.provider, { runtime: readRuntime() });

  invariant(key !== null, 'The configured evaluation credential is unavailable.');

  let misses = 0;

  for (const send of plan.sends) {
    const request = send.plannedCase.request;
    const started = performance.now();

    const attempt: SpawnedTaskAttempt = await sendEvaluationDecision(
      config.provider,
      key,
      request,
    ).then(
      (result) => ({ kind: 'reply', result }),
      (error: unknown) => ({ kind: 'failure', error }),
    );

    const { isMiss, ...outcome } = classifySpawnedTaskSample(request, attempt, blockThreshold);

    misses += isMiss ? 1 : 0;

    records.push({
      name: send.plannedCase.name,
      requestHash: send.plannedCase.requestHash,
      sample: send.sample,
      ...outcome,
      elapsedMs: Math.round(performance.now() - started),
    });

    console.log(JSON.stringify({ name: send.plannedCase.name, sample: send.sample, ...outcome }));

    await writeReport(plan.output, report);
  }

  await writeReport(plan.output, { ...report, completedAt: new Date().toISOString() });

  console.log(JSON.stringify({ sends: plan.sends.length, misses }));

  process.exitCode = misses === 0 ? 0 : 1;
}

await main();
