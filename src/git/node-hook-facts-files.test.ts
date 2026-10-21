import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeHookFactsFiles } from './node-hook-facts-files.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'hook-facts-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the text of a file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'config'), '[core]\n');

  const text = await nodeHookFactsFiles.readText(join(ctx.directory, 'config'));

  expect(text).toBe('[core]\n');
});

test('it reads a missing file as null', async () => {
  const ctx = await setupTest();
  const text = await nodeHookFactsFiles.readText(join(ctx.directory, 'missing'));

  expect(text).toBeNull();
});

test('it reads a path under a file as null', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'config'), '');

  const text = await nodeHookFactsFiles.readText(join(ctx.directory, 'config', 'nested'));

  expect(text).toBeNull();
});

test('it rejects reading a folder', async () => {
  const ctx = await setupTest();

  expect(nodeHookFactsFiles.readText(ctx.directory)).rejects.toMatchObject({ code: 'EISDIR' });
});

test('it probes a file that exists as present', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'lefthook.yml'), '');

  const isPresent = await nodeHookFactsFiles.probeFile(join(ctx.directory, 'lefthook.yml'));

  expect(isPresent).toBeTrue();
});

test('it probes a missing file as absent', async () => {
  const ctx = await setupTest();
  const isPresent = await nodeHookFactsFiles.probeFile(join(ctx.directory, 'lefthook.yml'));

  expect(isPresent).toBeFalse();
});
