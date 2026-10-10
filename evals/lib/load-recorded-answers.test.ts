import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMockJevRecord } from './factories/build-mock-jev-record.ts';
import { buildMockJevReport } from './factories/build-mock-jev-report.ts';
import { buildMockJudgeRecord } from './factories/build-mock-judge-record.ts';
import { buildMockJudgeReport } from './factories/build-mock-judge-report.ts';
import { loadRecordedAnswers } from './load-recorded-answers.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'recorded-answers-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const corporaDir = join(dir, 'corpora');
  const resultsDir = join(dir, 'results');

  await mkdir(corporaDir);
  await mkdir(resultsDir);

  return { corporaDir, resultsDir };
}

test('it reads a Jev report into answers by case ID and zero-based sample', async () => {
  const ctx = await setupTest();

  const first = buildMockJevRecord({ case: 'real-01', sample: 1 });
  const second = buildMockJevRecord({ case: 'real-01', sample: 2, status: 'deny', rule: 'X' });
  const report = buildMockJevReport({ model: 'jev-model', records: [first, second] });

  await writeFile(join(ctx.corporaDir, 'jev.json'), JSON.stringify(report));

  const recorded = await loadRecordedAnswers(
    { kind: 'jev-report', root: 'corpora', path: 'jev.json' },
    { corporaDir: ctx.corporaDir, resultsDir: null },
  );

  expect(recorded).toStrictEqual({
    input: {
      path: 'corpora:jev.json',
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
    { corporaDir: ctx.corporaDir, resultsDir: ctx.resultsDir },
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

  await writeFile(join(ctx.corporaDir, 'release.json'), JSON.stringify(report));

  const recorded = await loadRecordedAnswers(
    { kind: 'release', root: 'corpora', path: 'release.json' },
    { corporaDir: ctx.corporaDir, resultsDir: null },
  );

  expect(recorded).toStrictEqual({
    input: {
      path: 'corpora:release.json',
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

  await writeFile(join(ctx.corporaDir, 'release.json'), JSON.stringify(report));

  expect(
    loadRecordedAnswers(
      { kind: 'release', root: 'corpora', path: 'release.json' },
      { corporaDir: ctx.corporaDir, resultsDir: null },
    ),
  ).rejects.toThrowWithMessage(Error, 'corpora:release.json records twin-01 sample 0 twice.');
});

test('it reads nothing from the results clone when no clone is named', async () => {
  const ctx = await setupTest();

  const recorded = await loadRecordedAnswers(
    { kind: 'judge-report', root: 'results', path: 'judge.json' },
    { corporaDir: ctx.corporaDir, resultsDir: null },
  );

  expect(recorded).toBeNull();
});
