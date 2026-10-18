import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCorpusHashes } from './load-corpus-hashes.ts';

async function setupTest() {
  const corporaDir = await mkdtemp(join(tmpdir(), 'corpus-hashes-'));

  onTestFinished(() => rm(corporaDir, { recursive: true, force: true }));

  const directory = join(corporaDir, 'cases');

  await mkdir(directory);

  return { corporaDir, directory };
}

test('it keeps both hashes across a formatter pass', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'cases.json'), '{"cases":[{"id":"a"}]}');
  await writeFile(join(ctx.directory, 'labels.json'), '{"cases":{}}');

  const before = await loadCorpusHashes(ctx.directory, []);

  await writeFile(join(ctx.directory, 'cases.json'), '{\n  "cases": [{ "id": "a" }]\n}\n');
  await writeFile(join(ctx.directory, 'labels.json'), '{\n  "cases": {}\n}\n');

  const after = await loadCorpusHashes(ctx.directory, []);

  expect(after).toStrictEqual(before);
});

test('it changes the corpus hash and keeps the labels hash when a case file changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'cases.json'), '{"cases":[{"id":"a"}]}');
  await writeFile(join(ctx.directory, 'labels.json'), '{"cases":{}}');

  const before = await loadCorpusHashes(ctx.directory, []);

  await writeFile(join(ctx.directory, 'cases.json'), '{"cases":[{"id":"b"}]}');

  const after = await loadCorpusHashes(ctx.directory, []);

  expect(after.corpusHash).not.toBe(before.corpusHash);
  expect(after.labelsHash).toBe(before.labelsHash);
});

test('it changes the labels hash and keeps the corpus hash when a label changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'cases.json'), '{"cases":[{"id":"a"}]}');
  await writeFile(join(ctx.directory, 'labels.json'), '{"cases":{}}');

  const before = await loadCorpusHashes(ctx.directory, []);

  await writeFile(join(ctx.directory, 'labels.json'), '{"cases":{"a":{}}}');

  const after = await loadCorpusHashes(ctx.directory, []);

  expect(after.labelsHash).not.toBe(before.labelsHash);
  expect(after.corpusHash).toBe(before.corpusHash);
});

test('it changes the corpus hash when an input outside the corpus folder changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'cases.json'), '{"cases":[{"id":"a"}]}');
  await writeFile(join(ctx.directory, 'labels.json'), '{"cases":{}}');
  await writeFile(join(ctx.corporaDir, 'answers.json'), '{"records":[["a",0,1]]}');

  const before = await loadCorpusHashes(ctx.directory, ['answers.json']);

  await writeFile(join(ctx.corporaDir, 'answers.json'), '{"records":[["a",0,0]]}');

  const after = await loadCorpusHashes(ctx.directory, ['answers.json']);

  expect(after.corpusHash).not.toBe(before.corpusHash);
});
