import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeHookFactsFiles } from '../src/git/node-hook-facts-files.ts';
import { buildCountingHookFactsFiles } from './build-counting-hook-facts-files.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'counting-hook-facts-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the text the wrapped files read', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'config'), '[core]\n\tbare = false\n');

  const counting = buildCountingHookFactsFiles(nodeHookFactsFiles);

  const text = await counting.files.readText(join(ctx.directory, 'config'), 1024);

  expect(text).toBe('[core]\n\tbare = false\n');
});

test('it passes on the rejection of the wrapped files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'config'), '[core]\n\tbare = false\n');

  const counting = buildCountingHookFactsFiles(nodeHookFactsFiles);

  expect(counting.files.readText(join(ctx.directory, 'config'), 8)).rejects.toThrowWithMessage(
    Error,
    /larger than a git config/u,
  );
});

test('it probes through the wrapped files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'lefthook.yml'), '');

  const counting = buildCountingHookFactsFiles(nodeHookFactsFiles);

  const probes = await Promise.all([
    counting.files.probeFile(join(ctx.directory, 'lefthook.yml')),
    counting.files.probeFile(join(ctx.directory, 'lefthook.toml')),
  ]);

  expect(probes).toStrictEqual([true, false]);
});

test('it counts the reads that overlap and the UTF-8 bytes they return', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'a.gitconfig'), 'ab');
  await writeFile(join(ctx.directory, 'b.gitconfig'), 'cdé');

  const counting = buildCountingHookFactsFiles(nodeHookFactsFiles);

  await Promise.all([
    counting.files.readText(join(ctx.directory, 'a.gitconfig'), 1024),
    counting.files.readText(join(ctx.directory, 'b.gitconfig'), 1024),
  ]);

  expect(counting.readStats()).toStrictEqual({ peakReads: 2, bytesRead: 6 });
});

test('it counts reads that run one after another as one at a time', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'a.gitconfig'), 'ab');

  const counting = buildCountingHookFactsFiles(nodeHookFactsFiles);

  await counting.files.readText(join(ctx.directory, 'a.gitconfig'), 1024);
  await counting.files.readText(join(ctx.directory, 'a.gitconfig'), 1024);

  expect(counting.readStats()).toStrictEqual({ peakReads: 1, bytesRead: 4 });
});
