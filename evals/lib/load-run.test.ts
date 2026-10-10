import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRun } from './load-run.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'load-run-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads the summary and one record per samples line', async () => {
  const ctx = await setupTest();

  const summary = {
    runID: '20261010T120000Z-0a1b2c3d',
    config: {
      schemaVersion: 2,
      experiment: 'containment-replay',
      publicCommit: '8c52b93',
      dirtyTree: false,
      policyHash: 'p',
      judgePolicyHash: 'j',
      configuredRulesHash: 'r',
      corpusHash: 'c',
      labelsHash: 'l',
      recording: null,
      models: {},
      seed: 1,
      samples: 1,
      maxRequests: null,
      live: false,
      startedAt: '2026-10-10T12:00:00.000Z',
      completedAt: null,
    },
    notMeasured: [],
    counts: [],
    notScorable: [],
    latency: [],
    requiredCases: [],
  } as const;

  const record = {
    caseKey: 'decision-rules/T001',
    labels: { severity: 'safe', consent: 'none', source: 'recorded' },
    sample: 0,
    stage: 'containment',
    status: 'scored',
    verdict: 'allow',
    pBlock: null,
    reason: null,
    latencyMs: 1,
    requestHash: null,
    answerHash: null,
  } as const;

  await writeFile(join(ctx.dir, 'summary.json'), JSON.stringify(summary));
  await writeFile(join(ctx.dir, 'samples.jsonl'), `${JSON.stringify(record)}\n`);

  const run = await loadRun(ctx.dir);

  expect(run).toStrictEqual({ summary, records: [record], tornLine: null });
});

test('it reads a run interrupted before its first sample as no records', async () => {
  const ctx = await setupTest();

  const summary = {
    runID: '20261010T120000Z-0a1b2c3d',
    config: {
      schemaVersion: 2,
      experiment: 'containment-replay',
      publicCommit: '8c52b93',
      dirtyTree: true,
      policyHash: 'p',
      judgePolicyHash: 'j',
      configuredRulesHash: 'r',
      corpusHash: 'c',
      labelsHash: 'l',
      recording: null,
      models: {},
      seed: 1,
      samples: 1,
      maxRequests: null,
      live: false,
      startedAt: '2026-10-10T12:00:00.000Z',
      completedAt: null,
    },
    notMeasured: [],
    counts: [],
    notScorable: [],
    latency: [],
    requiredCases: [],
  } as const;

  await writeFile(join(ctx.dir, 'summary.json'), JSON.stringify(summary));

  const run = await loadRun(ctx.dir);

  expect(run).toStrictEqual({ summary, records: [], tornLine: null });
});

test('it drops a torn last samples line and returns it', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'summary.json'),
    JSON.stringify({
      runID: '20261010T120000Z-0a1b2c3d',
      config: {
        schemaVersion: 2,
        experiment: 'containment-replay',
        publicCommit: '8c52b93',
        dirtyTree: false,
        policyHash: 'p',
        judgePolicyHash: 'j',
        configuredRulesHash: 'r',
        corpusHash: 'c',
        labelsHash: 'l',
        recording: null,
        models: {},
        seed: 1,
        samples: 1,
        maxRequests: null,
        live: false,
        startedAt: '2026-10-10T12:00:00.000Z',
        completedAt: null,
      },
      notMeasured: [],
      counts: [],
      notScorable: [],
      latency: [],
      requiredCases: [],
    }),
  );

  const record = {
    caseKey: 'decision-rules/T001',
    labels: { severity: 'safe', consent: 'none', source: 'recorded' },
    sample: 0,
    stage: 'containment',
    status: 'scored',
    verdict: 'allow',
    pBlock: null,
    reason: null,
    latencyMs: 1,
    requestHash: null,
    answerHash: null,
  } as const;

  await writeFile(
    join(ctx.dir, 'samples.jsonl'),
    `${JSON.stringify(record)}\n{"caseKey":"decision-rules/T0`,
  );

  const run = await loadRun(ctx.dir);

  expect(run.records).toStrictEqual([record]);
  expect(run.tornLine).toBe('{"caseKey":"decision-rules/T0');
});

test('it rejects an unparseable samples line that a newline ends', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'summary.json'),
    JSON.stringify({
      runID: '20261010T120000Z-0a1b2c3d',
      config: {
        schemaVersion: 2,
        experiment: 'containment-replay',
        publicCommit: '8c52b93',
        dirtyTree: false,
        policyHash: 'p',
        judgePolicyHash: 'j',
        configuredRulesHash: 'r',
        corpusHash: 'c',
        labelsHash: 'l',
        recording: null,
        models: {},
        seed: 1,
        samples: 1,
        maxRequests: null,
        live: false,
        startedAt: '2026-10-10T12:00:00.000Z',
        completedAt: null,
      },
      notMeasured: [],
      counts: [],
      notScorable: [],
      latency: [],
      requiredCases: [],
    }),
  );

  await writeFile(join(ctx.dir, 'samples.jsonl'), '{"caseKey":"decision-rules/T0\n');

  expect(loadRun(ctx.dir)).rejects.toThrow();
});

test('it rejects a samples line that is not a sample record', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'summary.json'),
    JSON.stringify({
      runID: '20261010T120000Z-0a1b2c3d',
      config: {
        schemaVersion: 2,
        experiment: 'containment-replay',
        publicCommit: '8c52b93',
        dirtyTree: false,
        policyHash: 'p',
        judgePolicyHash: 'j',
        configuredRulesHash: 'r',
        corpusHash: 'c',
        labelsHash: 'l',
        recording: null,
        models: {},
        seed: 1,
        samples: 1,
        maxRequests: null,
        live: false,
        startedAt: '2026-10-10T12:00:00.000Z',
        completedAt: null,
      },
      notMeasured: [],
      counts: [],
      notScorable: [],
      latency: [],
      requiredCases: [],
    }),
  );

  await writeFile(join(ctx.dir, 'samples.jsonl'), '{"caseKey":"T001"}\n');

  expect(loadRun(ctx.dir)).rejects.toThrow();
});
