import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from 'auto-mode';
import type { ActionRequest } from 'auto-mode';
import {
  buildDecisionRequest,
  loadClaudeRules,
  loadPolicy,
  readHostEnvironment,
  readRuntime,
  resolveApiKey,
  resolveOpeningPrompt,
} from 'auto-mode/eval';
import invariant from 'tiny-invariant';
import { assertShippedJevConfig } from '../lib/assert-shipped-jev-config.ts';
import { classifySpawnedTaskSample } from '../lib/classify-spawned-task-sample.ts';
import type { SpawnedTaskAttempt } from '../lib/classify-spawned-task-sample.ts';
import { resolveBlockThreshold } from '../lib/resolve-block-threshold.ts';
import { sendEvaluationDecision } from '../lib/send-evaluation-decision.ts';
import { spawnedTaskCorpusSchema } from '../lib/spawned-task-corpus-schema.ts';
import { toHash } from '../lib/to-hash.ts';
import { writeReport } from '../lib/write-report.ts';

async function main(): Promise<void> {
  const args = parseArgs({
    options: {
      live: { type: 'boolean' },
      output: { type: 'string' },
      samples: { type: 'string', default: '3' },
    },
  });

  const output = args.values.output;
  const isLive = args.values.live === true;
  const samples = Number(args.values.samples);

  invariant(
    !isLive || output !== undefined,
    'Pass --live --output <path> to send requests; without --live the script only builds them.',
  );

  invariant(Number.isInteger(samples) && samples >= 1, 'Pass --samples as a positive integer.');

  const root = resolve(import.meta.dirname, '../..');

  const corpusText = await readFile(join(root, 'evals/corpora/spawned-task/cases.json'), 'utf8');

  const corpus = spawnedTaskCorpusSchema.parse(JSON.parse(corpusText));

  const config = await loadConfig();

  assertShippedJevConfig(config);

  const configuredRules = await loadClaudeRules(config.claudeSettingsPath, readHostEnvironment());
  const policy = await loadPolicy({}, 'decision.md');

  // The scope file a launcher writes for a session it spawned, read from memory
  // so the run writes no file.
  const scopeText = JSON.stringify({
    format: 'auto-mode.scope',
    version: 1,
    replyChannels: [
      { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: corpus.spawner },
    ],
  });

  const launcherRuntime = {
    host: { env: { AUTO_MODE_SCOPE_FILE: '/launcher/scope.json' }, home: '/launcher' },
    readTextFile: () => Promise.resolve(scopeText),
  };

  const cases = await Promise.all(
    corpus.cases.map(async (entry) => {
      const opening = {
        text: entry.openingPrompt,
        origin: 'composer',
        position: 'opening',
      } as const;

      const payload: ActionRequest = {
        sessionID: 'spawned-task-evaluation',
        cwd: corpus.cwd,
        toolName: entry.tool,
        toolInput: entry.input,
        decisionContext: {
          agentID: null,
          originalUserTask: opening,
          delegatedTask: null,
          lastDirectUserMessage: opening,
          omittedTaskContext: [],
        },
      };

      const resolved = await resolveOpeningPrompt(payload, launcherRuntime);

      invariant(
        resolved.decisionContext?.delegatedTask?.origin === 'agent.spawn' &&
          resolved.decisionContext.originalUserTask === null &&
          resolved.decisionContext.lastDirectUserMessage === null,
        'A spawned opening prompt reaches Jev as the delegated task alone.',
      );

      const request = buildDecisionRequest(resolved, policy, {
        configuredRules,
        lastUserMessage: null,
        rulesSource: 'shipped',
        repositoryContext: null,
      });

      return { entry, request };
    }),
  );

  invariant(cases.length * samples <= 32, 'The evaluation sends at most 32 requests.');

  const records: unknown[] = [];
  const blockThreshold = resolveBlockThreshold(config);

  const report = {
    model: config.provider.model,
    blockThreshold,
    samplesPerCase: samples,
    retries: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    policyHash: toHash(policy),
    configuredRulesHash: toHash(JSON.stringify(configuredRules)),
    corpusHash: toHash(JSON.stringify(corpus)),
    records,
  };

  if (isLive && output !== undefined) {
    await writeReport(output, report);
  }

  const key = isLive ? await resolveApiKey(config.provider, { runtime: readRuntime() }) : null;

  invariant(!isLive || key !== null, 'The configured evaluation credential is unavailable.');

  let misses = 0;

  for (const item of cases) {
    const request = item.request;

    const base = {
      name: item.entry.name,
      requestHash: toHash(JSON.stringify(request)),
    };

    if (key === null) {
      console.log(JSON.stringify(base));
      continue;
    }

    for (let sample = 1; sample <= samples; sample += 1) {
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
        ...base,
        sample,
        ...outcome,
        elapsedMs: Math.round(performance.now() - started),
      });

      console.log(JSON.stringify({ name: item.entry.name, sample, ...outcome }));

      if (output !== undefined) {
        await writeReport(output, report);
      }
    }
  }

  if (output !== undefined && key !== null) {
    await writeReport(output, { ...report, completedAt: new Date().toISOString() });
  }

  if (key !== null) {
    console.log(JSON.stringify({ sends: cases.length * samples, misses }));

    process.exitCode = misses === 0 ? 0 : 1;
  }
}

await main();
