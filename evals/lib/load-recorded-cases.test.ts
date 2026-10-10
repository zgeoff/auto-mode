import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadRecordedCases } from './load-recorded-cases.ts';

async function setupTest() {
  const resultsDir = await mkdtemp(join(tmpdir(), 'recorded-cases-'));

  onTestFinished(() => rm(resultsDir, { recursive: true, force: true }));

  return { resultsDir, corporaDir: resolve(import.meta.dirname, '../corpora') };
}

test('it loads the cases without recorded answers for a live run', async () => {
  const ctx = await setupTest();

  const loaded = await loadRecordedCases(
    { corporaDir: ctx.corporaDir, resultsDir: null, recording: null },
    { corpora: ['second-judge'], withHeldOut: false, recordings: {} },
  );

  expect(loaded.inputs).toStrictEqual([]);
  expect(loaded.notMeasured).toStrictEqual([]);
  expect(loaded.sets[0]?.cases['real-01']?.recorded).toStrictEqual({});
});

test('it gives each case of the recorded corpus its recorded answers and records the input it read', async () => {
  const ctx = await setupTest();

  const recordings = {
    baseline: [
      {
        corpus: 'second-judge',
        stage: 'jev',
        source: {
          kind: 'jev-report',
          root: 'corpora',
          path: 'recorded/second-judge/jev-baseline.json',
        },
      },
    ],
  } as const;

  const loaded = await loadRecordedCases(
    { corporaDir: ctx.corporaDir, resultsDir: null, recording: 'baseline' },
    { corpora: ['second-judge'], withHeldOut: false, recordings },
  );

  expect(loaded.inputs).toStrictEqual([
    {
      path: 'corpora:recorded/second-judge/jev-baseline.json',
      hash: expect.toSatisfy((hash: string) => /^[0-9a-f]{64}$/u.test(hash)),
    },
  ]);

  expect(Object.keys(loaded.sets[0]?.cases['real-01']?.recorded['jev'] ?? {})).toStrictEqual([
    '0',
    '1',
    '2',
  ]);

  expect(loaded.notMeasured).toStrictEqual([]);
});

test('it reports a stage as not measured when the results clone lacks its recording', async () => {
  const ctx = await setupTest();

  const recordings = {
    'baseline-glm': [
      {
        corpus: 'second-judge',
        stage: 'judge',
        source: {
          kind: 'judge-report',
          root: 'results',
          path: 'legacy/second-judge/judge-glm.json',
        },
      },
    ],
  } as const;

  const loaded = await loadRecordedCases(
    { corporaDir: ctx.corporaDir, resultsDir: ctx.resultsDir, recording: 'baseline-glm' },
    { corpora: ['second-judge'], withHeldOut: false, recordings },
  );

  expect(loaded.inputs).toStrictEqual([]);

  expect(loaded.notMeasured).toStrictEqual([
    'stage judge on second-judge: the recording legacy/second-judge/judge-glm.json is in the results clone, and none holds it',
  ]);
});
