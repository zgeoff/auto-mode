import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCorpusHashes } from './load-corpus-hashes.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'corpus-hashes-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it keeps both hashes across a formatter pass', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'cases.json'), '{"cases":[{"id":"a"}]}');
  await writeFile(join(ctx.dir, 'labels.json'), '{"cases":{}}');

  const before = await loadCorpusHashes(ctx.dir);

  await writeFile(join(ctx.dir, 'cases.json'), '{\n  "cases": [{ "id": "a" }]\n}\n');
  await writeFile(join(ctx.dir, 'labels.json'), '{\n  "cases": {}\n}\n');

  const after = await loadCorpusHashes(ctx.dir);

  expect(after).toStrictEqual(before);
});

test('it changes the corpus hash and keeps the labels hash when a case file changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'cases.json'), '{"cases":[{"id":"a"}]}');
  await writeFile(join(ctx.dir, 'labels.json'), '{"cases":{}}');

  const before = await loadCorpusHashes(ctx.dir);

  await writeFile(join(ctx.dir, 'cases.json'), '{"cases":[{"id":"b"}]}');

  const after = await loadCorpusHashes(ctx.dir);

  expect(after.corpusHash).not.toBe(before.corpusHash);
  expect(after.labelsHash).toBe(before.labelsHash);
});

test('it changes the labels hash and keeps the corpus hash when a label changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'cases.json'), '{"cases":[{"id":"a"}]}');
  await writeFile(join(ctx.dir, 'labels.json'), '{"cases":{}}');

  const before = await loadCorpusHashes(ctx.dir);

  await writeFile(join(ctx.dir, 'labels.json'), '{"cases":{"a":{}}}');

  const after = await loadCorpusHashes(ctx.dir);

  expect(after.labelsHash).not.toBe(before.labelsHash);
  expect(after.corpusHash).toBe(before.corpusHash);
});
