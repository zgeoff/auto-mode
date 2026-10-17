import { expect, mock, onTestFinished, test } from 'bun:test';
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
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
        {
          name: 'judge',
          sends: true,
          reviews: 'jev',
          run: () => Promise.resolve({ status: 'skipped', reason: 'Jev allowed.' }),
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 2,
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
        send,
        sendWithChoices: null,
        judgeModel: null,
        sendJudge: null,
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: (line) => printed.push(line),
    },
  );

  expect(result).toMatchObject({ kind: 'planned', plan: { cases: 13, requests: 52 } });

  expect(printed).toStrictEqual([
    'Plan: 13 cases × 2 samples × 2 stages; 52 stage runs to go, 0 already recorded, 52 model requests.',
    '  jev: 26 model requests',
    '  judge: at most 26 model requests, one for each jev deny',
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
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
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
      recording: null,
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 12,
      resumeDir: null,
      cases: null,
      environment: {
        publicCommit: 'test',
        dirtyTree: false,
        policy: 'policy',
        judgePolicy: 'judge policy',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        send,
        sendWithChoices: null,
        judgeModel: null,
        sendJudge: null,
      },
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

test('it records each live answer with its stage model, probability of block, request hash and answer hash', async () => {
  const ctx = await setupTest();

  const result = await runExperiment(
    defineExperiment({
      name: 'model-check',
      description: 'A stage that asks the model.',
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
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
      recording: null,
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 13,
      resumeDir: null,
      cases: null,
      environment: {
        publicCommit: 'test',
        dirtyTree: false,
        policy: 'policy',
        judgePolicy: 'judge policy',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        send: (request) => sendEvaluationDecision(buildMockProviderConfig(), 'test-key', request),
        sendWithChoices: null,
        judgeModel: null,
        sendJudge: null,
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  invariant(result.kind === 'completed');

  const run = await loadRun(result.runDir);

  expect(run.summary.config.models).toStrictEqual({ jev: 'jev-1.13.0' });
  expect(run.records).toHaveLength(13);

  expect(run.records).toSatisfyAll(
    (record: SampleRecord) =>
      record.status === 'scored' &&
      record.pBlock === 0 &&
      /^[0-9a-f]{64}$/u.test(record.requestHash ?? '') &&
      /^[0-9a-f]{64}$/u.test(record.answerHash ?? ''),
  );
});

test('it keeps the stage model of a live run that stops after its first answer', async () => {
  const ctx = await setupTest();

  let calls = 0;

  const run = runExperiment(
    defineExperiment({
      name: 'model-check',
      description: 'A stage that asks the model.',
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
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
      recording: null,
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 13,
      resumeDir: null,
      cases: null,
      environment: {
        publicCommit: 'test',
        dirtyTree: false,
        policy: 'policy',
        judgePolicy: 'judge policy',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        send: (request) => sendEvaluationDecision(buildMockProviderConfig(), 'test-key', request),
        sendWithChoices: null,
        judgeModel: null,
        sendJudge: null,
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  expect(run).rejects.toThrowWithMessage(Error, 'interrupted');

  const [runID] = await readdir(join(ctx.resultsDir, 'runs/model-check'));
  const interrupted = await loadRun(join(ctx.resultsDir, 'runs/model-check', runID ?? ''));

  expect(interrupted.summary.config.models).toStrictEqual({ jev: 'jev-1.13.0' });
  expect(interrupted.records).toHaveLength(1);
});

test('it scores a fallback judge reply under the configured judge model and counts it by the model that wrote it', async () => {
  const ctx = await setupTest();

  const sendJudge = mock()
    .mockResolvedValueOnce({ model: 'claude-sonnet-5', text: 'fallback reply', fallback: true })
    .mockResolvedValueOnce({
      model: 'claude-sonnet-5-5',
      text: 'configured reply',
      fallback: false,
    });

  const result = await runExperiment(
    defineExperiment({
      name: 'fallback-check',
      description: 'A judge stage whose first reply comes from a fallback model.',
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'judge',
          sends: true,
          run: async (_entry, context) => {
            const reply = await context.sendJudge({ user: 'review' });

            return { status: 'scored', verdict: 'deny', pBlock: null, reason: reply.text };
          },
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 2,
      resumeDir: null,
      cases: ['containment/twin-02', 'containment/twin-01'],
      environment: {
        publicCommit: 'test',
        dirtyTree: false,
        policy: 'policy',
        judgePolicy: 'judge policy',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        send: null,
        sendWithChoices: null,
        judgeModel: 'claude-sonnet-5-5',
        sendJudge,
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  invariant(result.kind === 'completed');

  const run = await loadRun(result.runDir);

  expect(
    run.records.map((record) => ({
      caseKey: record.caseKey,
      status: record.status,
      reason: record.reason,
      model: record.model,
      fallback: record.fallback,
    })),
  ).toStrictEqual([
    {
      caseKey: 'containment/twin-01',
      status: 'scored',
      reason: 'fallback reply',
      model: 'claude-sonnet-5',
      fallback: true,
    },
    {
      caseKey: 'containment/twin-02',
      status: 'scored',
      reason: 'configured reply',
      model: 'claude-sonnet-5-5',
      fallback: false,
    },
  ]);

  expect(run.summary.config.models).toStrictEqual({ judge: 'claude-sonnet-5-5' });
  expect(run.summary.config.cases).toStrictEqual(['containment/twin-01', 'containment/twin-02']);

  expect(run.summary.fallbacks).toStrictEqual([
    {
      stage: 'judge',
      model: 'claude-sonnet-5-5',
      answered: 2,
      fallbacks: 1,
      models: { 'claude-sonnet-5': 1 },
    },
  ]);
});

test('it leaves unscored a judge reply to a request that named another model than the stage’s', async () => {
  const ctx = await setupTest();

  const calls = { first: true };

  const experiment = defineExperiment({
    name: 'judge-model-check',
    description: 'A judge stage resumed with another judge model.',
    corpora: ['containment'],
    samples: 1,
    loadCases: async (source) => {
      const dir = join(source.corporaDir, 'containment');

      const loaded = await loadCaseKeys(dir);

      return {
        sets: [
          {
            corpus: 'containment',
            dir,
            cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
          },
        ],
        inputs: [],
        notMeasured: [],
      };
    },
    stages: [
      {
        name: 'judge',
        sends: true,
        run: async (entry, context) => {
          if (entry.key === 'containment/twin-02' && calls.first) {
            calls.first = false;
            throw new Error('interrupted');
          }

          const reply = await context.sendJudge({ user: 'review' });

          return { status: 'scored', verdict: 'deny', pBlock: null, reason: reply.text };
        },
      },
    ],
    measurements: [],
  });

  const options = {
    corporaDir: ctx.corporaDir,
    resultsDir: ctx.resultsDir,
    recording: null,
    seed: 1,
    samples: 1,
    live: true,
    maxRequests: 2,
    resumeDir: null,
    cases: ['containment/twin-01', 'containment/twin-02'],
    now: () => new Date('2026-10-10T12:00:00.000Z'),
    print: () => {},
  };

  const environment = {
    publicCommit: 'test',
    dirtyTree: false,
    policy: 'policy',
    judgePolicy: 'judge policy',
    configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
    send: null,
    sendWithChoices: null,
  };

  expect(
    runExperiment(experiment, {
      ...options,
      environment: {
        ...environment,
        judgeModel: 'claude-sonnet-5-5',
        sendJudge: mock().mockResolvedValue({
          model: 'claude-sonnet-5-5',
          text: 'first',
          fallback: false,
        }),
      },
    }),
  ).rejects.toThrowWithMessage(Error, 'interrupted');

  const [runID] = await readdir(join(ctx.resultsDir, 'runs/judge-model-check'));

  const runDir = join(ctx.resultsDir, 'runs/judge-model-check', runID ?? '');

  const result = await runExperiment(experiment, {
    ...options,
    resumeDir: runDir,
    environment: {
      ...environment,
      judgeModel: 'claude-opus-5-5',
      sendJudge: mock().mockResolvedValue({
        model: 'claude-opus-5-5',
        text: 'second',
        fallback: false,
      }),
    },
  });

  invariant(result.kind === 'completed');

  const resumed = await loadRun(runDir);

  expect(
    resumed.records.map((record) => ({
      caseKey: record.caseKey,
      status: record.status,
      reason: record.reason,
      model: record.model,
    })),
  ).toStrictEqual([
    {
      caseKey: 'containment/twin-01',
      status: 'scored',
      reason: 'first',
      model: 'claude-sonnet-5-5',
    },
    {
      caseKey: 'containment/twin-02',
      status: 'not-scorable',
      reason: 'model-changed',
      model: 'claude-opus-5-5',
    },
  ]);

  expect(resumed.summary.fallbacks).toStrictEqual([
    { stage: 'judge', model: 'claude-sonnet-5-5', answered: 1, fallbacks: 0, models: {} },
  ]);
});

test('it refuses a run limited to a case the experiment lacks', async () => {
  const ctx = await setupTest();

  expect(
    runExperiment(
      defineExperiment({
        name: 'case-check',
        description: 'A local stage over named cases.',
        corpora: ['containment'],
        samples: 1,
        loadCases: async (source) => {
          const dir = join(source.corporaDir, 'containment');

          const loaded = await loadCaseKeys(dir);

          return {
            sets: [
              {
                corpus: 'containment',
                dir,
                cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
              },
            ],
            inputs: [],
            notMeasured: [],
          };
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
        recording: null,
        seed: 1,
        samples: 1,
        live: false,
        maxRequests: null,
        resumeDir: null,
        cases: ['containment/twin-01', 'containment/twin-99'],
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
      },
    ),
  ).rejects.toThrowWithMessage(Error, 'The case-check cases lack [containment/twin-99].');
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
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
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
      recording: null,
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 13,
      resumeDir: null,
      cases: null,
      environment: {
        publicCommit: 'test',
        dirtyTree: false,
        policy: 'policy',
        judgePolicy: 'judge policy',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        send: (request) => sendEvaluationDecision(buildMockProviderConfig(), 'test-key', request),
        sendWithChoices: null,
        judgeModel: null,
        sendJudge: null,
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  invariant(result.kind === 'completed');

  expect(result.summary.config.models).toStrictEqual({});

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

test('it replays a recording through the stages that can, names the stage that cannot, and sends nothing', async () => {
  const ctx = await setupTest();

  const send = mock(() => Promise.reject(new Error('unreachable')));

  const result = await runExperiment(
    defineExperiment({
      name: 'recorded-check',
      description: 'A model stage with a recording and one without.',
      corpora: ['containment'],
      samples: 1,
      recordings: [{ name: 'baseline', description: 'the baseline answers' }],
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [{ path: 'corpora:recorded/baseline.json', hash: 'abc' }],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: () => Promise.reject(new Error('unreachable')),
          replay: () =>
            Promise.resolve({
              status: 'scored',
              verdict: 'deny',
              pBlock: 0.9,
              reason: 'Data Exfiltration',
              recorded: { answer: { status: 'deny' }, latencyMs: 412, model: 'jev-1.13.0' },
            }),
        },
        {
          name: 'jev-categorical',
          sends: true,
          run: () => Promise.reject(new Error('unreachable')),
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: 'baseline',
      seed: 1,
      samples: 1,
      live: false,
      maxRequests: null,
      resumeDir: null,
      cases: null,
      environment: {
        publicCommit: 'test',
        dirtyTree: true,
        policy: 'policy',
        judgePolicy: 'judge policy',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        send,
        sendWithChoices: null,
        judgeModel: null,
        sendJudge: null,
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  invariant(result.kind === 'completed');

  const run = await loadRun(result.runDir);

  expect(send).not.toHaveBeenCalled();

  expect(run.summary.notMeasured).toStrictEqual([
    'stage jev-categorical: the baseline recording holds no answers for it',
  ]);

  expect(run.summary.config.recording).toBe('baseline');
  expect(run.summary.config.dirtyTree).toBe(true);
  expect(run.summary.config.models).toStrictEqual({ jev: 'jev-1.13.0' });

  expect(run.records).toSatisfyAll(
    (record: SampleRecord) =>
      record.stage === 'jev' &&
      record.latencyMs === 412 &&
      record.requestHash === null &&
      /^[0-9a-f]{64}$/u.test(record.answerHash ?? ''),
  );

  expect(new Set(run.records.map((record) => record.answerHash)).size).toBe(1);
});

test('it replays the recorded stages and sends only the recording’s live stages in a live run', async () => {
  const ctx = await setupTest();

  const sendJudge = mock(() =>
    Promise.resolve({ model: 'claude-sonnet-5-5', text: 'confirm', fallback: false }),
  );

  const result = await runExperiment(
    defineExperiment({
      name: 'recorded-live-check',
      description: 'A recorded Jev stage and a live judge stage.',
      corpora: ['containment'],
      samples: 1,
      recordings: [{ name: 'jev-only', description: 'the Jev answers', liveStages: ['judge'] }],
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [{ path: 'corpora:recorded/jev-only.json', hash: 'abc' }],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: () => Promise.reject(new Error('unreachable')),
          replay: () =>
            Promise.resolve({
              status: 'scored',
              verdict: 'deny',
              pBlock: 0.9,
              reason: 'deny: Data Exfiltration',
              recorded: { answer: { status: 'deny' }, latencyMs: 412, model: 'jev-1.13.0' },
            }),
        },
        {
          name: 'judge',
          sends: true,
          run: async (_entry, context) => {
            const reply = await context.sendJudge({ user: 'review' });

            return { status: 'scored', verdict: 'deny', pBlock: null, reason: reply.text };
          },
          replay: () => Promise.reject(new Error('unreachable')),
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: 'jev-only',
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 1000,
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
        sendJudge,
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  invariant(result.kind === 'completed');

  const run = await loadRun(result.runDir);

  const jev = run.records.filter((record) => record.stage === 'jev');
  const judge = run.records.filter((record) => record.stage === 'judge');

  expect(run.summary.notMeasured).toStrictEqual([]);
  expect(run.summary.config.recording).toBe('jev-only');
  expect(run.summary.config.live).toBe(true);
  expect(judge).toHaveLength(jev.length);
  expect(sendJudge).toHaveBeenCalledTimes(jev.length);
  expect(jev).toSatisfyAll((record: SampleRecord) => record.requestHash === null);

  expect(judge).toSatisfyAll(
    (record: SampleRecord) =>
      record.reason === 'confirm' && /^[0-9a-f]{64}$/u.test(record.requestHash ?? ''),
  );
});

test('it caps a live replay run at the judge requests its recorded Jev denies need', async () => {
  const ctx = await setupTest();

  const sendJudge = mock(() =>
    Promise.resolve({ model: 'claude-sonnet-5-5', text: 'confirm', fallback: false }),
  );

  const printed: string[] = [];

  const result = await runExperiment(
    defineExperiment({
      name: 'judge-only-check',
      description: 'A recorded Jev stage that denies only sample 0 and a live judge.',
      corpora: ['containment'],
      samples: 1,
      recordings: [{ name: 'jev-only', description: 'the Jev answers', liveStages: ['judge'] }],
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: () => Promise.reject(new Error('unreachable')),
          replay: (_entry, context) => {
            const outcome: StageOutcome =
              context.sample === 0
                ? {
                    status: 'scored',
                    verdict: 'deny',
                    pBlock: 0.9,
                    reason: 'deny: Data Exfiltration',
                  }
                : { status: 'scored', verdict: 'allow', pBlock: 0.1, reason: null };

            return Promise.resolve(outcome);
          },
        },
        {
          name: 'judge',
          sends: true,
          reviews: 'jev',
          run: async (_entry, context) => {
            const jev = context.previous.find((record) => record.stage === 'jev');

            if (jev?.verdict !== 'deny') {
              return { status: 'skipped', reason: 'Jev did not deny this sample.' };
            }

            const reply = await context.sendJudge({ user: 'review' });

            return { status: 'scored', verdict: 'deny', pBlock: null, reason: reply.text };
          },
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: 'jev-only',
      seed: 1,
      samples: 2,
      live: true,
      maxRequests: 13,
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
        sendJudge,
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: (line) => printed.push(line),
    },
  );

  invariant(result.kind === 'completed');

  expect(result.plan.requests).toBe(13);
  expect(sendJudge).toHaveBeenCalledTimes(13);

  expect(printed).toStrictEqual([
    'Plan: 13 cases × 2 samples × 2 stages; 52 stage runs to go, 0 already recorded, 13 model requests.',
    '  judge: 13 model requests',
  ]);

  const run = await loadRun(result.runDir);

  expect(run.records.filter((record) => record.requestHash !== null)).toHaveLength(13);
});

test('it refuses a live replay run whose recorded Jev denies need more judge requests than the cap', async () => {
  const ctx = await setupTest();

  const sendJudge = mock(() => Promise.reject(new Error('unreachable')));

  const run = runExperiment(
    defineExperiment({
      name: 'judge-only-check',
      description: 'A recorded Jev stage that denies only sample 0 and a live judge.',
      corpora: ['containment'],
      samples: 1,
      recordings: [{ name: 'jev-only', description: 'the Jev answers', liveStages: ['judge'] }],
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: () => Promise.reject(new Error('unreachable')),
          replay: (_entry, context) => {
            const outcome: StageOutcome =
              context.sample === 0
                ? {
                    status: 'scored',
                    verdict: 'deny',
                    pBlock: 0.9,
                    reason: 'deny: Data Exfiltration',
                  }
                : { status: 'scored', verdict: 'allow', pBlock: 0.1, reason: null };

            return Promise.resolve(outcome);
          },
        },
        {
          name: 'judge',
          sends: true,
          reviews: 'jev',
          run: async (_entry, context) => {
            const jev = context.previous.find((record) => record.stage === 'jev');

            if (jev?.verdict !== 'deny') {
              return { status: 'skipped', reason: 'Jev did not deny this sample.' };
            }

            const reply = await context.sendJudge({ user: 'review' });

            return { status: 'scored', verdict: 'deny', pBlock: null, reason: reply.text };
          },
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: 'jev-only',
      seed: 1,
      samples: 2,
      live: true,
      maxRequests: 12,
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
        sendJudge,
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  expect(run).rejects.toThrowWithMessage(
    Error,
    'Refusing to run: the plan needs 13 model requests and --max-requests is 12.',
  );

  expect(sendJudge).not.toHaveBeenCalled();
});

test('it counts each live stage after a unit’s first live send in a live replay run', async () => {
  const ctx = await setupTest();

  const send = mock(() => Promise.reject(new Error('unreachable')));
  const sendJudge = mock(() => Promise.reject(new Error('unreachable')));

  const run = runExperiment(
    defineExperiment({
      name: 'two-live-check',
      description: 'A recorded containment stage and two live stages.',
      corpora: ['containment'],
      samples: 1,
      recordings: [
        {
          name: 'containment-only',
          description: 'the containment answers',
          liveStages: ['jev', 'judge'],
        },
      ],
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'containment',
          sends: false,
          run: () =>
            Promise.resolve({ status: 'scored', verdict: 'allow', pBlock: null, reason: null }),
        },
        {
          name: 'jev',
          sends: true,
          run: async (_entry, context) => {
            await context.send(buildMockDecisionRequest());

            return { status: 'scored', verdict: 'allow', pBlock: 0, reason: null };
          },
        },
        {
          name: 'judge',
          sends: true,
          reviews: 'jev',
          run: () => Promise.resolve({ status: 'skipped', reason: 'Jev allowed.' }),
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: 'containment-only',
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 25,
      resumeDir: null,
      cases: null,
      environment: {
        publicCommit: 'test',
        dirtyTree: false,
        policy: 'policy',
        judgePolicy: 'judge policy',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        send,
        sendWithChoices: null,
        judgeModel: null,
        sendJudge,
      },
      now: () => new Date('2026-10-10T12:00:00.000Z'),
      print: () => {},
    },
  );

  expect(run).rejects.toThrowWithMessage(
    Error,
    'Refusing to run: the plan needs 26 model requests and --max-requests is 25.',
  );

  expect(send).not.toHaveBeenCalled();
});

test('it refuses a live run against a recording that names no live stage', async () => {
  const ctx = await setupTest();

  const run = runExperiment(
    defineExperiment({
      name: 'recorded-check',
      description: 'A model stage with a recording.',
      corpora: ['containment'],
      samples: 1,
      recordings: [{ name: 'baseline', description: 'the baseline answers' }],
      loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
      stages: [],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: 'baseline',
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 10,
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
    },
  );

  expect(run).rejects.toThrowWithMessage(
    Error,
    'A run that replays a recording sends nothing; drop --live.',
  );
});

test('it refuses a live run against a recording whose live stage the experiment does not send', async () => {
  const ctx = await setupTest();

  const run = runExperiment(
    defineExperiment({
      name: 'recorded-check',
      description: 'A deterministic stage and a recording that names it and an unknown stage live.',
      corpora: ['containment'],
      samples: 1,
      recordings: [
        { name: 'baseline', description: 'the baseline answers', liveStages: ['local', 'jduge'] },
      ],
      loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
      stages: [
        {
          name: 'local',
          sends: false,
          run: () => Promise.resolve({ status: 'skipped', reason: 'unreachable' }),
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: 'baseline',
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 10,
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
    },
  );

  expect(run).rejects.toThrowWithMessage(
    Error,
    'The baseline recording names live stages the recorded-check experiment does not send: local, jduge.',
  );
});

test('it refuses a recording the experiment does not define', async () => {
  const ctx = await setupTest();

  const run = runExperiment(
    defineExperiment({
      name: 'recorded-check',
      description: 'A model stage with a recording.',
      corpora: ['containment'],
      samples: 1,
      recordings: [{ name: 'baseline', description: 'the baseline answers' }],
      loadCases: () => Promise.resolve({ sets: [], inputs: [], notMeasured: [] }),
      stages: [],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: 'guidance',
      seed: 1,
      samples: 1,
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
    },
  );

  expect(run).rejects.toThrowWithMessage(
    Error,
    'The recorded-check experiment has no recording guidance. Known: baseline.',
  );
});

test('it measures only the cases the experiment selects, keyed by their corpus', async () => {
  const ctx = await setupTest();

  const result = await runExperiment(
    defineExperiment({
      name: 'select-check',
      description: 'A deterministic stage over two twins.',
      corpora: ['containment'],
      samples: 1,
      selectCase: (_label, key) => key === 'containment/twin-01' || key === 'containment/twin-02',
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'containment',
          sends: false,
          run: (entry) =>
            Promise.resolve({
              status: 'scored',
              verdict: 'allow',
              pBlock: null,
              reason: entry.case,
            }),
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 1,
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
    },
  );

  invariant(result.kind === 'completed');

  const run = await loadRun(result.runDir);

  expect(run.records.map((record) => [record.caseKey, record.reason])).toIncludeSameMembers([
    ['containment/twin-01', 'twin-01'],
    ['containment/twin-02', 'twin-02'],
  ]);
});

test('it refuses a run whose cases lack a required case', async () => {
  const ctx = await setupTest();

  const run = runExperiment(
    defineExperiment({
      name: 'required-check',
      description: 'A deterministic stage that needs one twin.',
      corpora: ['containment'],
      samples: 1,
      requiredCases: ['containment/twin-01'],
      selectCase: (_label, key) => key === 'containment/twin-02',
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 1,
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
    },
  );

  expect(run).rejects.toThrowWithMessage(
    Error,
    'The required-check cases lack the required [containment/twin-01].',
  );
});

test('it reports each required case by key with every stage verdict', async () => {
  const ctx = await setupTest();

  const result = await runExperiment(
    defineExperiment({
      name: 'required-check',
      description: 'A deterministic stage that needs one twin.',
      corpora: ['containment'],
      samples: 2,
      requiredCases: ['containment/twin-01'],
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'containment',
          sends: false,
          run: (_entry, context) => {
            const outcome: StageOutcome =
              context.sample === 0
                ? { status: 'scored', verdict: 'deny', pBlock: null, reason: 'outside scope' }
                : { status: 'skipped', reason: 'no sample' };

            return Promise.resolve(outcome);
          },
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 2,
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
    },
  );

  invariant(result.kind === 'completed');

  expect(result.summary.requiredCases).toStrictEqual([
    {
      caseKey: 'containment/twin-01',
      labels: { severity: 'safe', consent: 'asked', source: 'synthetic' },
      stage: 'containment',
      verdicts: ['deny', 'skipped'],
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
      corpora: ['containment'],
      samples: 2,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [{ name: 'containment', sends: false, run: () => Promise.resolve(scored) }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 2,
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
      corpora: ['containment'],
      samples: 2,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [{ name: 'containment', sends: false, run }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 2,
      live: false,
      maxRequests: null,
      resumeDir: first.runDir,
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

test('it counts a resumed live replay run with the model each stage answered with first', async () => {
  const ctx = await setupTest();

  const deny: StageOutcome = {
    status: 'scored',
    verdict: 'deny',
    pBlock: 0.9,
    reason: 'deny: Data Exfiltration',
  };

  const options = {
    corporaDir: ctx.corporaDir,
    resultsDir: ctx.resultsDir,
    recording: 'jev-only',
    seed: 1,
    samples: 1,
    live: true,
    maxRequests: 13,
    environment: {
      publicCommit: 'test',
      dirtyTree: false,
      policy: 'policy',
      judgePolicy: 'judge policy',
      configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
      send: null,
      sendWithChoices: null,
      judgeModel: null,
      sendJudge: () =>
        Promise.resolve({ model: 'claude-sonnet-5-5', text: 'confirm', fallback: false }),
    },
    now: () => new Date('2026-10-10T12:00:00.000Z'),
    print: () => {},
  };

  const first = await runExperiment(
    defineExperiment({
      name: 'judge-only-check',
      description: 'A recorded Jev stage that denies every case and a live judge.',
      corpora: ['containment'],
      samples: 1,
      recordings: [{ name: 'jev-only', description: 'the Jev answers', liveStages: ['judge'] }],
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: () => Promise.reject(new Error('unreachable')),
          replay: () =>
            Promise.resolve({
              ...deny,
              recorded: { answer: { status: 'deny' }, latencyMs: 412, model: 'jev-1.13.0' },
            }),
        },
        {
          name: 'judge',
          sends: true,
          reviews: 'jev',
          run: async (_entry, context) => {
            const reply = await context.sendJudge({ user: 'review' });

            return { status: 'scored', verdict: 'deny', pBlock: null, reason: reply.text };
          },
        },
      ],
      measurements: [],
    }),
    { ...options, resumeDir: null, cases: null },
  );

  invariant(first.kind === 'completed');

  await writeFile(join(first.runDir, 'samples.jsonl'), '');

  const sendJudge = mock(() =>
    Promise.resolve({ model: 'claude-sonnet-5-5', text: 'confirm', fallback: false }),
  );

  const resumed = await runExperiment(
    defineExperiment({
      name: 'judge-only-check',
      description: 'A recorded Jev stage that denies every case and a live judge.',
      corpora: ['containment'],
      samples: 1,
      recordings: [{ name: 'jev-only', description: 'the Jev answers', liveStages: ['judge'] }],
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: () => Promise.reject(new Error('unreachable')),
          replay: () =>
            Promise.resolve({
              ...deny,
              recorded: { answer: { status: 'deny' }, latencyMs: 412, model: 'jev-1.14.0' },
            }),
        },
        {
          name: 'judge',
          sends: true,
          reviews: 'jev',
          run: async (_entry, context) => {
            const jev = context.previous.find((record) => record.stage === 'jev');

            if (jev?.status !== 'scored') {
              return { status: 'skipped', reason: 'Jev did not deny this sample.' };
            }

            const reply = await context.sendJudge({ user: 'review' });

            return { status: 'scored', verdict: 'deny', pBlock: null, reason: reply.text };
          },
        },
      ],
      measurements: [],
    }),
    {
      ...options,
      resumeDir: first.runDir,
      cases: null,
      environment: { ...options.environment, sendJudge },
    },
  );

  invariant(resumed.kind === 'completed');

  expect(resumed.plan.requests).toBe(0);
  expect(sendJudge).not.toHaveBeenCalled();
});

test('it resumes a run whose last samples line is torn, says so, and runs that stage run again', async () => {
  const ctx = await setupTest();

  const scored: StageOutcome = { status: 'scored', verdict: 'deny', pBlock: null, reason: null };

  const first = await runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [{ name: 'containment', sends: false, run: () => Promise.resolve(scored) }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 1,
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
    },
  );

  invariant(first.kind === 'completed');

  const text = await readFile(join(first.runDir, 'samples.jsonl'), 'utf8');

  const lines = text.split('\n').filter((line) => line !== '');

  await writeFile(join(first.runDir, 'samples.jsonl'), `${lines.slice(0, 12).join('\n')}\n`);
  await appendFile(join(first.runDir, 'samples.jsonl'), (lines[12] ?? '').slice(0, 20));

  const run = mock(() => Promise.resolve(scored));
  const printed: string[] = [];

  await runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [{ name: 'containment', sends: false, run }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 1,
      live: false,
      maxRequests: null,
      resumeDir: first.runDir,
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
      now: () => new Date('2026-10-10T13:00:00.000Z'),
      print: (line) => printed.push(line),
    },
  );

  const reloaded = await loadRun(first.runDir);

  expect(run).toHaveBeenCalledOnce();

  expect(printed).toContain(
    'Dropped a torn last line from samples.jsonl (20 characters); its stage run runs again.',
  );

  expect(reloaded.tornLine).toBeNull();
  expect(reloaded.records).toHaveLength(13);
});

test('it refuses to resume a run with another seed', async () => {
  const ctx = await setupTest();

  const scored: StageOutcome = { status: 'scored', verdict: 'deny', pBlock: null, reason: null };

  const first = await runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [{ name: 'containment', sends: false, run: () => Promise.resolve(scored) }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 1,
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
    },
  );

  invariant(first.kind === 'completed');

  const resumed = runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [{ name: 'containment', sends: false, run: () => Promise.resolve(scored) }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 2,
      samples: 1,
      live: false,
      maxRequests: null,
      resumeDir: first.runDir,
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
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
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
      recording: null,
      seed: 1,
      samples: 1,
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
    },
  );

  expect(run).rejects.toThrowWithMessage(Error, /--results or AUTO_MODE_EVALS_DIR/u);
});

test('it writes a run whose summary and samples the result schemas read back', async () => {
  const ctx = await setupTest();

  const result = await runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
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
      recording: null,
      seed: 1,
      samples: 1,
      live: false,
      maxRequests: null,
      resumeDir: null,
      cases: null,
      environment: {
        publicCommit: 'test',
        dirtyTree: true,
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
    },
  );

  invariant(result.kind === 'completed');

  const run = await loadRun(result.runDir);

  expect(result.runDir).toStartWith(join(ctx.resultsDir, 'runs/local-check/20261010T120000Z-'));
  expect(run.summary).toStrictEqual(result.summary);

  expect(run.summary.config).toStrictEqual({
    schemaVersion: 2,
    experiment: 'local-check',
    publicCommit: 'test',
    dirtyTree: true,
    policyHash: expect.toBeString(),
    judgePolicyHash: expect.toBeString(),
    configuredRulesHash: expect.toBeString(),
    corpusHash: expect.toBeString(),
    labelsHash: expect.toBeString(),
    recording: null,
    cases: null,
    models: {},
    seed: 1,
    samples: 1,
    maxRequests: null,
    live: false,
    startedAt: '2026-10-10T12:00:00.000Z',
    completedAt: '2026-10-10T12:00:00.000Z',
  });

  expect(run.records).toHaveLength(13);
});

test.each([
  ['a timeout', 'TimeoutError', 'judge-timeout'],
  ['an abort', 'AbortError', 'judge-timeout'],
  ['any other failure', 'Error', 'judge-request'],
])(
  'it records %s of the judge transport as not scorable with its reason',
  async (_label, name, reason) => {
    const ctx = await setupTest();

    const failure = new Error('The judge transport failed.');

    failure.name = name;

    const result = await runExperiment(
      defineExperiment({
        name: 'judge-check',
        description: 'A stage that asks the judge.',
        corpora: ['containment'],
        samples: 1,
        loadCases: async (source) => {
          const dir = join(source.corporaDir, 'containment');

          const loaded = await loadCaseKeys(dir);

          return {
            sets: [
              {
                corpus: 'containment',
                dir,
                cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
              },
            ],
            inputs: [],
            notMeasured: [],
          };
        },
        stages: [
          {
            name: 'judge',
            sends: true,
            run: async (_entry, context) => {
              const reply = await context.sendJudge({ user: 'Review this deny.' });

              return { status: 'scored', verdict: 'allow', pBlock: null, reason: reply.text };
            },
          },
        ],
        measurements: [],
      }),
      {
        corporaDir: ctx.corporaDir,
        resultsDir: ctx.resultsDir,
        recording: null,
        seed: 1,
        samples: 1,
        live: true,
        maxRequests: 13,
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
          sendJudge: () => Promise.reject(failure),
        },
        now: () => new Date('2026-10-10T12:00:00.000Z'),
        print: () => {},
      },
    );

    invariant(result.kind === 'completed');

    expect(result.summary.notScorable).toStrictEqual([
      { stage: 'judge', notScorable: 13, attempted: 13, skipped: 0, reasons: { [reason]: 13 } },
    ]);
  },
);

test('it stops a live run whose judge stage has no judge transport instead of recording failures', async () => {
  const ctx = await setupTest();

  const result = runExperiment(
    defineExperiment({
      name: 'judge-check',
      description: 'A stage that asks the judge.',
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'judge',
          sends: true,
          run: async (_entry, context) => {
            const reply = await context.sendJudge({ user: 'Review this deny.' });

            return { status: 'scored', verdict: 'allow', pBlock: null, reason: reply.text };
          },
        },
      ],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 1,
      live: true,
      maxRequests: 13,
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
    },
  );

  expect(result).rejects.toThrowWithMessage(Error, 'The judge stage has no judge transport.');
});

test('it names the stages a recording left out in the all-stages count', async () => {
  const ctx = await setupTest();

  const result = await runExperiment(
    defineExperiment({
      name: 'recorded-check',
      description: 'A Jev stage with a recording and a judge without one.',
      corpora: ['containment'],
      samples: 1,
      recordings: [{ name: 'baseline', description: 'the baseline answers' }],
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [
        {
          name: 'jev',
          sends: true,
          run: () => Promise.reject(new Error('unreachable')),
          replay: () =>
            Promise.resolve({
              status: 'scored',
              verdict: 'deny',
              pBlock: null,
              reason: null,
              recorded: { answer: 'deny', latencyMs: 300, model: 'jev-1.13.0' },
            }),
        },
        {
          name: 'judge',
          sends: true,
          reviews: 'jev',
          run: () => Promise.reject(new Error('unreachable')),
        },
      ],
      measurements: [
        (records) => [
          {
            measurement: 'denied',
            stage: 'all-stages',
            source: 'synthetic',
            unit: 'cases',
            observations: records.map((record) => ({ caseKey: record.caseKey, event: true })),
          },
        ],
      ],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: 'baseline',
      seed: 1,
      samples: 1,
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
    },
  );

  invariant(result.kind === 'completed');

  expect(result.summary.counts.map((count) => count.stage)).toStrictEqual([
    'all-stages without judge',
  ]);
});

test('it refuses to resume a run started from a dirty tree', async () => {
  const ctx = await setupTest();

  const scored: StageOutcome = { status: 'scored', verdict: 'deny', pBlock: null, reason: null };

  const first = await runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [{ name: 'containment', sends: false, run: () => Promise.resolve(scored) }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 1,
      live: false,
      maxRequests: null,
      resumeDir: null,
      cases: null,
      environment: {
        publicCommit: 'test',
        dirtyTree: true,
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
    },
  );

  invariant(first.kind === 'completed');

  const resumed = runExperiment(
    defineExperiment({
      name: 'local-check',
      description: 'A deterministic stage.',
      corpora: ['containment'],
      samples: 1,
      loadCases: async (source) => {
        const dir = join(source.corporaDir, 'containment');

        const loaded = await loadCaseKeys(dir);

        return {
          sets: [
            {
              corpus: 'containment',
              dir,
              cases: Object.fromEntries(loaded.keys.map((key) => [key, key])),
            },
          ],
          inputs: [],
          notMeasured: [],
        };
      },
      stages: [{ name: 'containment', sends: false, run: () => Promise.resolve(scored) }],
      measurements: [],
    }),
    {
      corporaDir: ctx.corporaDir,
      resultsDir: ctx.resultsDir,
      recording: null,
      seed: 1,
      samples: 1,
      live: false,
      maxRequests: null,
      resumeDir: first.runDir,
      cases: null,
      environment: {
        publicCommit: 'test',
        dirtyTree: true,
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
    },
  );

  expect(resumed).rejects.toThrowWithMessage(
    Error,
    'Refusing to resume a run started from a dirty tree: no commit names its code.',
  );
});
