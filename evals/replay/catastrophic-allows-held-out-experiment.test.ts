import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { catastrophicAllowsHeldOut } from '../experiments/catastrophic-allows-held-out.ts';

test('it reads no public corpus and reports the held-out set as not measured without a results clone', async () => {
  const loaded = await catastrophicAllowsHeldOut.loadCases({
    corporaDir: resolve(import.meta.dirname, '../corpora'),
    resultsDir: null,
    recording: null,
  });

  expect(loaded).toStrictEqual({
    sets: [],
    inputs: [],
    notMeasured: ['held-out set: no results clone named, so the held-out set was not read'],
  });
});
