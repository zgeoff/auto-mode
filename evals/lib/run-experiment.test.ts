import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { HttpResponse, http } from 'msw';
import invariant from 'tiny-invariant';
import { DECISION_URL } from '../../mocks/handlers.ts';
import { server } from '../../mocks/node.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import { defineExperiment } from './define-experiment.ts';
import type { StageOutcome } from './define-experiment.ts';
import { loadCaseKeys } from './load-case-keys.ts';
import { loadRun } from './load-run.ts';
import { runExperiment } from './run-experiment.ts';
import type { SampleRecord } from './sample-record-schema.ts';
import { sendEvaluationDecision } from './send-evaluation-decision.ts';

async function setupTest() {
  const resultsDir = await mkdtemp(join(tmpdir(), 'run-experiment-'));

  onTestFinished(() => rm(resultsDir, { recursive: true, force: true }));

  return { resultsDir, corporaDir: resolve(import.meta.dirname, '../corpora') };
}

test('it plans a model experiment without live mode and sends and writes nothing', async () => {
  const ctx = await setupTest();

  const send = mock(() => Promise.reject(new Error('unreachable')));
  const printed: string[] = [];

  const result = await runExperiment(
    defineExperiment({
      name: 'model-check',
      description: 'A stage that asks the model.',
      corpus: 'containment',
      inputs: [],
      samples: 1,
      loadCases: async (dir) => {
        const loaded = await loadCaseKeys(dir);

        return new Map(loaded.keys.map((key) => [key, key]));
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: async (_entry, context) => {
            await context.send(buildMockDecisionRequest());

            return { status: 'scored', verdict: 'allow', pBlock: 0, reason: null };
          },
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      seed: 1,
      samples: 2,
      live: false,
      maxRequests: null,
      resumeDir: null,
      environment: { publicCommit: 'test', policy: 'policy', configuredRules: {}, send },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: (line) => printed.push(line),
    },
  );

  expect(result).toMatchObject({ kind: 'planned', plan: { cases: 13, requests: 26 } });

  expect(printed).toStrictEqual([
    'Plan: 13 cases × 2 samples × 1 stages; 26 stage runs to go, 0 already recorded, 26 model requests.',
    'Nothing was sent. Pass --live --max-requests <n> to send these requests.',
  ]);

  expect(send).not.toHaveBeenCalled();

  const entries = await readdir(ctx.resultsDir);

  expect(entries).toBeEmpty();
});

test('it refuses a live run whose plan needs more requests than the cap', async () => {
  const ctx = await setupTest();

  const send = mock(() => Promise.reject(new Error('unreachable')));

  const run = runExperiment(
    defineExperiment({
      name: 'model-check',
      description: 'A stage that asks the model.',
      corpus: 'containment',
      inputs: [],
      samples: 1,
      loadCases: async (dir) => {
        const loaded = await loadCaseKeys(dir);

        return new Map(loaded.keys.map((key) => [key, key]));
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: async (_entry, context) => {
            await context.send(buildMockDecisionRequest());

            return { status: 'scored', verdict: 'allow', pBlock: 0, reason: null };
          },
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 12,
      resumeDir: null,
      environment: { publicCommit: 'test', policy: 'policy', configuredRules: {}, send },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  expect(run).rejects.toThrowWithMessage(
    Error,
    'Refusing to run: the plan needs 13 model requests and --max-requests is 12.',
  );

  expect(send).not.toHaveBeenCalled();

  const entries = await readdir(ctx.resultsDir);

  expect(entries).toBeEmpty();
});

test('it records each live answer with its model, probability of block and request hash', async () => {
  const ctx = await setupTest();

  const result = await runExperiment(
    defineExperiment({
      name: 'model-check',
      description: 'A stage that asks the model.',
      corpus: 'containment',
      inputs: [],
      samples: 1,
      loadCases: async (dir) => {
        const loaded = await loadCaseKeys(dir);

        return new Map(loaded.keys.map((key) => [key, key]));
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: async (_entry, context) => {
            const answer = await context.send(
              buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } }),
            );

            const block = answer.answers['rule_0']?.probabilities.block ?? null;

            return { status: 'scored', verdict: 'allow', pBlock: block, reason: null };
          },
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 13,
      resumeDir: null,
      environment: {
        publicCommit: 'test',
        policy: 'policy',
        configuredRules: {},
        send: (request) => sendEvaluationDecision(buildMockProviderConfig(), 'test-key', request),
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  invariant(result.kind === 'completed');

  const run = await loadRun(result.runDir);

  expect(run.summary.config.model).toBe('jev-1.13.0');
  expect(run.records).toHaveLength(13);

  expect(run.records).toSatisfyAll(
    (record: SampleRecord) =>
      record.status === 'scored' &&
      record.pBlock === 0 &&
      /^[0-9a-f]{64}$/.test(record.requestHash ?? ''),
  );
});

test('it keeps the model of a live run that stops after its first answer', async () => {
  const ctx = await setupTest();

  let calls = 0;

  const run = runExperiment(
    defineExperiment({
      name: 'model-check',
      description: 'A stage that asks the model.',
      corpus: 'containment',
      inputs: [],
      samples: 1,
      loadCases: async (dir) => {
        const loaded = await loadCaseKeys(dir);

        return new Map(loaded.keys.map((key) => [key, key]));
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: async (_entry, context) => {
            calls += 1;

            if (calls > 1) {
              throw new Error('interrupted');
            }

            await context.send(buildMockDecisionRequest());

            return { status: 'scored', verdict: 'allow', pBlock: 0, reason: null };
          },
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 13,
      resumeDir: null,
      environment: {
        publicCommit: 'test',
        policy: 'policy',
        configuredRules: {},
        send: (request) => sendEvaluationDecision(buildMockProviderConfig(), 'test-key', request),
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  expect(run).rejects.toThrowWithMessage(Error, 'interrupted');

  const [runID] = await readdir(join(ctx.resultsDir, 'runs/model-check'));
  const interrupted = await loadRun(join(ctx.resultsDir, 'runs/model-check', runID ?? ''));

  expect(interrupted.summary.config.model).toBe('jev-1.13.0');
  expect(interrupted.records).toHaveLength(1);
});

test('it records a failed request as not scorable with its reason', async () => {
  const ctx = await setupTest();

  server.use(
    http.post(DECISION_URL, () =>
      HttpResponse.json({ type: 'error', error: { type: 'api_error' } }, { status: 500 }),
    ),
  );

  const result = await runExperiment(
    defineExperiment({
      name: 'model-check',
      description: 'A stage that asks the model.',
      corpus: 'containment',
      inputs: [],
      samples: 1,
      loadCases: async (dir) => {
        const loaded = await loadCaseKeys(dir);

        return new Map(loaded.keys.map((key) => [key, key]));
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: async (_entry, context) => {
            await context.send(buildMockDecisionRequest());

            return { status: 'scored', verdict: 'allow', pBlock: 0, reason: null };
          },
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 13,
      resumeDir: null,
      environment: {
        publicCommit: 'test',
        policy: 'policy',
        configuredRules: {},
        send: (request) => sendEvaluationDecision(buildMockProviderConfig(), 'test-key', request),
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  invariant(result.kind === 'completed');

  expect(result.summary.config.model).toBeNull();

  expect(result.summary.notScorable).toStrictEqual([
    {
      stage: 'jev',
      notScorable: 13,
      attempted: 13,
      skipped: 0,
      reasons: { 'decision-http-status': 13 },
    },
  ]);
});

test('it resumes a run by running only the stage runs its samples file lacks', async () => {
  const ctx = await setupTest();

  const scored: StageOutcome = { status: 'scored', verdict: 'deny', pBlock: null, reason: null };

  const first = await runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpus: 'containment',
      inputs: [],
      samples: 2,
      loadCases: async (dir) => {
        const loaded = await loadCaseKeys(dir);

        return new Map(loaded.keys.map((key) => [key, key]));
      },
      stages: [{ name: 'containment', sends: false, run: () => Promise.resolve(scored) }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      seed: 1,
      samples: 2,
      live: false,
      maxRequests: null,
      resumeDir: null,
      environment: { publicCommit: 'test', policy: 'policy', configuredRules: {}, send: null },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  invariant(first.kind === 'completed');

  const text = await readFile(join(first.runDir, 'samples.jsonl'), 'utf8');

  const lines = text.split('\n');

  await writeFile(join(first.runDir, 'samples.jsonl'), `${lines.slice(0, 10).join('\n')}\n`);

  const run = mock(() => Promise.resolve(scored));

  const resumed = await runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpus: 'containment',
      inputs: [],
      samples: 2,
      loadCases: async (dir) => {
        const loaded = await loadCaseKeys(dir);

        return new Map(loaded.keys.map((key) => [key, key]));
      },
      stages: [{ name: 'containment', sends: false, run }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      seed: 1,
      samples: 2,
      live: false,
      maxRequests: null,
      resumeDir: first.runDir,
      environment: { publicCommit: 'test', policy: 'policy', configuredRules: {}, send: null },
      now: () => new Date('2026-10-10T13:00:00.000Z'),
      print: () => {},
    },
  );

  invariant(resumed.kind === 'completed');

  const reloaded = await loadRun(first.runDir);

  expect(run).toHaveBeenCalledTimes(16);
  expect(resumed.runDir).toBe(first.runDir);
  expect(reloaded.records).toHaveLength(26);

  expect(new Set(reloaded.records.map((record) => `${record.caseKey}/${record.sample}`)).size).toBe(
    26,
  );
});

test('it refuses to resume a run with another seed', async () => {
  const ctx = await setupTest();

  const scored: StageOutcome = { status: 'scored', verdict: 'deny', pBlock: null, reason: null };

  const first = await runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpus: 'containment',
      inputs: [],
      samples: 1,
      loadCases: async (dir) => {
        const loaded = await loadCaseKeys(dir);

        return new Map(loaded.keys.map((key) => [key, key]));
      },
      stages: [{ name: 'containment', sends: false, run: () => Promise.resolve(scored) }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      seed: 1,
      samples: 1,
      live: false,
      maxRequests: null,
      resumeDir: null,
      environment: { publicCommit: 'test', policy: 'policy', configuredRules: {}, send: null },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  invariant(first.kind === 'completed');

  const resumed = runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpus: 'containment',
      inputs: [],
      samples: 1,
      loadCases: async (dir) => {
        const loaded = await loadCaseKeys(dir);

        return new Map(loaded.keys.map((key) => [key, key]));
      },
      stages: [{ name: 'containment', sends: false, run: () => Promise.resolve(scored) }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      seed: 2,
      samples: 1,
      live: false,
      maxRequests: null,
      resumeDir: first.runDir,
      environment: { publicCommit: 'test', policy: 'policy', configuredRules: {}, send: null },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  expect(resumed).rejects.toThrowWithMessage(Error, 'Refusing to resume: the run differs in seed.');
});

test('it refuses to write a run with no results directory named', async () => {
  const ctx = await setupTest();

  const run = runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpus: 'containment',
      inputs: [],
      samples: 1,
      loadCases: async (dir) => {
        const loaded = await loadCaseKeys(dir);

        return new Map(loaded.keys.map((key) => [key, key]));
      },
      stages: [
        {
          name: 'containment',
          sends: false,
          run: () => Promise.resolve({ status: 'skipped', reason: 'none' }),
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: null,
      seed: 1,
      samples: 1,
      live: false,
      maxRequests: null,
      resumeDir: null,
      environment: { publicCommit: 'test', policy: 'policy', configuredRules: {}, send: null },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  expect(run).rejects.toThrowWithMessage(Error, /--results or AUTO_MODE_EVALS_DIR/);
});

test('it writes a run whose summary and samples the result schemas read back', async () => {
  const ctx = await setupTest();

  const result = await runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpus: 'containment',
      inputs: [],
      samples: 1,
      loadCases: async (dir) => {
        const loaded = await loadCaseKeys(dir);

        return new Map(loaded.keys.map((key) => [key, key]));
      },
      stages: [
        {
          name: 'containment',
          sends: false,
          run: () =>
            Promise.resolve({ status: 'scored', verdict: 'allow', pBlock: null, reason: null }),
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      seed: 1,
      samples: 1,
      live: false,
      maxRequests: null,
      resumeDir: null,
      environment: { publicCommit: 'test', policy: 'policy', configuredRules: {}, send: null },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  invariant(result.kind === 'completed');

  const run = await loadRun(result.runDir);

  expect(result.runDir).toStartWith(join(ctx.resultsDir, 'runs/local-check/20261010T120000Z-'));
  expect(run.summary).toStrictEqual(result.summary);

  expect(run.summary.config).toStrictEqual({
    schemaVersion: 1,
    experiment: 'local-check',
    publicCommit: 'test',
    policyHash: expect.toBeString(),
    configuredRulesHash: expect.toBeString(),
    corpusHash: expect.toBeString(),
    labelsHash: expect.toBeString(),
    model: null,
    seed: 1,
    samples: 1,
    maxRequests: null,
    live: false,
    startedAt: '2026-10-10T12:00:00.000Z',
    completedAt: '2026-10-10T12:00:00.000Z',
  });

  expect(run.records).toHaveLength(13);
});
