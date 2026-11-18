import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockJevRecord } from '../test-utils/factories/build-mock-jev-record.ts';
import { buildMockJevReport } from '../test-utils/factories/build-mock-jev-report.ts';
import { buildMockJudgeRecord } from '../test-utils/factories/build-mock-judge-record.ts';
import { buildMockJudgeReport } from '../test-utils/factories/build-mock-judge-report.ts';
import { buildMockSampleRecord } from '../test-utils/factories/build-mock-sample-record.ts';
import { loadRecordedAnswers } from './load-recorded-answers.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'recorded-answers-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repoRoot = join(directory, 'repo');
  const resultsDir = join(directory, 'results');

  await mkdir(repoRoot);
  await mkdir(resultsDir);

  return { repoRoot, resultsDir };
}

test('it reads a Jev report into answers by case ID and zero-based sample', async () => {
  const ctx = await setupTest();

  const first = buildMockJevRecord({ case: 'real-01', sample: 1 });
  const second = buildMockJevRecord({ case: 'real-01', sample: 2, status: 'deny', rule: 'X' });
  const report = buildMockJevReport({ model: 'jev-model', records: [first, second] });

  await writeFile(join(ctx.repoRoot, 'jev.json'), JSON.stringify(report));

  const recorded = await loadRecordedAnswers(
    { kind: 'jev-report', root: 'repo', path: 'jev.json' },
    { repoRoot: ctx.repoRoot, resultsDir: null },
  );

  expect(recorded).toStrictEqual({
    input: {
      path: 'repo:jev.json',
      hash: expect.toSatisfy((hash: string) => /^[0-9a-f]{64}$/u.test(hash)),
    },
    answers: {
      'real-01': {
        0: { kind: 'jev-record', record: first, model: 'jev-model' },
        1: { kind: 'jev-record', record: second, model: 'jev-model' },
      },
    },
  });
});

test('it reads a judge report from the results clone', async () => {
  const ctx = await setupTest();

  const record = buildMockJudgeRecord({ case: 'control-11', sample: 3, verdict: 'block' });
  const report = buildMockJudgeReport({ model: 'judge-model', records: [record] });

  await writeFile(join(ctx.resultsDir, 'judge.json'), JSON.stringify(report));

  const recorded = await loadRecordedAnswers(
    { kind: 'judge-report', root: 'results', path: 'judge.json' },
    { repoRoot: ctx.repoRoot, resultsDir: ctx.resultsDir },
  );

  expect(recorded).toStrictEqual({
    input: {
      path: 'results:judge.json',
      hash: expect.toSatisfy((hash: string) => /^[0-9a-f]{64}$/u.test(hash)),
    },
    answers: { 'control-11': { 2: { kind: 'judge', record, model: 'judge-model' } } },
  });
});

test('it reads a release recording and keeps one answer for a repeat that agrees', async () => {
  const ctx = await setupTest();

  const report = {
    source: { model: 'jev-model' },
    records: [
      ['twin-01', 0, 1],
      ['twin-01', 0, 1],
      ['twin-01', 1, 0],
    ],
  };

  await writeFile(join(ctx.repoRoot, 'release.json'), JSON.stringify(report));

  const recorded = await loadRecordedAnswers(
    { kind: 'release', root: 'repo', path: 'release.json' },
    { repoRoot: ctx.repoRoot, resultsDir: null },
  );

  expect(recorded).toStrictEqual({
    input: {
      path: 'repo:release.json',
      hash: expect.toSatisfy((hash: string) => /^[0-9a-f]{64}$/u.test(hash)),
    },
    answers: {
      'twin-01': {
        0: { kind: 'release', released: true, model: 'jev-model' },
        1: { kind: 'release', released: false, model: 'jev-model' },
      },
    },
  });
});

test('it refuses a recording that answers one sample two ways', async () => {
  const ctx = await setupTest();

  const report = {
    source: { model: 'jev-model' },
    records: [
      ['twin-01', 0, 1],
      ['twin-01', 0, 0],
    ],
  };

  await writeFile(join(ctx.repoRoot, 'release.json'), JSON.stringify(report));

  expect(
    loadRecordedAnswers(
      { kind: 'release', root: 'repo', path: 'release.json' },
      { repoRoot: ctx.repoRoot, resultsDir: null },
    ),
  ).rejects.toThrowWithMessage(Error, 'repo:release.json records twin-01 sample 0 twice.');
});

test('it reads one stage of one corpus from a run directory, keyed by case key without the corpus', async () => {
  const ctx = await setupTest();

  const summary = {
    runID: '20261010T120000Z-0a1b2c3d',
    config: {
      schemaVersion: 2,
      experiment: 'judge-alone',
      publicCommit: '8c52b93',
      dirtyTree: false,
      policyHash: 'p',
      judgePolicyHash: 'j',
      configuredRulesHash: 'r',
      corpusHash: 'c',
      labelsHash: 'l',
      recording: null,
      models: { jev: 'jev-model', judge: 'judge-model' },
      seed: 1,
      samples: 2,
      maxRequests: null,
      live: true,
      startedAt: '2026-10-10T12:00:00.000Z',
      completedAt: '2026-10-10T13:00:00.000Z',
    },
    notMeasured: [],
    counts: [],
    notScorable: [],
    latency: [],
    requiredCases: [],
  };

  const first = buildMockSampleRecord({
    caseKey: 'second-judge/control-39',
    sample: 0,
    stage: 'judge',
    verdict: 'deny',
    reason: 'confirmed: Credential Exploration',
  });

  const second = buildMockSampleRecord({
    caseKey: 'second-judge/control-39',
    sample: 1,
    stage: 'judge',
    status: 'not-scorable',
    verdict: null,
    reason: 'judge-unreadable',
  });

  const otherStage = buildMockSampleRecord({
    caseKey: 'second-judge/control-39',
    sample: 0,
    stage: 'jev',
    verdict: 'deny',
  });

  const otherCorpus = buildMockSampleRecord({
    caseKey: 'answer-guidance/pair-01',
    sample: 0,
    stage: 'judge',
    verdict: 'allow',
  });

  await mkdir(join(ctx.repoRoot, 'run'));
  await writeFile(join(ctx.repoRoot, 'run', 'summary.json'), JSON.stringify(summary));

  await writeFile(
    join(ctx.repoRoot, 'run', 'samples.jsonl'),
    `${[first, otherStage, otherCorpus, second].map((record) => JSON.stringify(record)).join('\n')}\n`,
  );

  const recorded = await loadRecordedAnswers(
    { kind: 'run', root: 'repo', path: 'run', stage: 'judge', corpus: 'second-judge' },
    { repoRoot: ctx.repoRoot, resultsDir: null },
  );

  expect(recorded).toStrictEqual({
    input: {
      path: 'repo:run#judge',
      hash: expect.toSatisfy((hash: string) => /^[0-9a-f]{64}$/u.test(hash)),
    },
    keyedBy: 'key',
    answers: {
      'control-39': {
        0: { kind: 'sample', record: first, model: 'judge-model' },
        1: { kind: 'sample', record: second, model: 'judge-model' },
      },
    },
  });
});

test('it refuses a run directory whose summary names no model for the stage', async () => {
  const ctx = await setupTest();

  const summary = {
    runID: '20261010T120000Z-0a1b2c3d',
    config: {
      schemaVersion: 2,
      experiment: 'judge-alone',
      publicCommit: '8c52b93',
      dirtyTree: false,
      policyHash: 'p',
      judgePolicyHash: 'j',
      configuredRulesHash: 'r',
      corpusHash: 'c',
      labelsHash: 'l',
      recording: null,
      models: { jev: 'jev-model' },
      seed: 1,
      samples: 1,
      maxRequests: null,
      live: true,
      startedAt: '2026-10-10T12:00:00.000Z',
      completedAt: '2026-10-10T13:00:00.000Z',
    },
    notMeasured: [],
    counts: [],
    notScorable: [],
    latency: [],
    requiredCases: [],
  };

  await mkdir(join(ctx.repoRoot, 'run'));
  await writeFile(join(ctx.repoRoot, 'run', 'summary.json'), JSON.stringify(summary));

  expect(
    loadRecordedAnswers(
      { kind: 'run', root: 'repo', path: 'run', stage: 'judge', corpus: 'second-judge' },
      { repoRoot: ctx.repoRoot, resultsDir: null },
    ),
  ).rejects.toThrowWithMessage(Error, 'repo:run names no model for the judge stage.');
});

test('it reads nothing from the results clone when no clone is named', async () => {
  const ctx = await setupTest();

  const recorded = await loadRecordedAnswers(
    { kind: 'judge-report', root: 'results', path: 'judge.json' },
    { repoRoot: ctx.repoRoot, resultsDir: null },
  );

  expect(recorded).toBeNull();
});
