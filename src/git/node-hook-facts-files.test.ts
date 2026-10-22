import { expect, onTestFinished, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
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

  expect(nodeHookFactsFiles.readText(ctx.directory)).rejects.toThrowWithMessage(
    Error,
    /is not a regular file/u,
  );
});

test('it reads /dev/null as empty', async () => {
  const text = await nodeHookFactsFiles.readText('/dev/null');

  expect(text).toBe('');
});

test('it rejects a device that never ends', () => {
  expect(nodeHookFactsFiles.readText('/dev/zero')).rejects.toThrowWithMessage(
    Error,
    /is not a regular file/u,
  );
});

test('it rejects a named pipe at once, with no writer', async () => {
  const ctx = await setupTest();

  execFileSync('mkfifo', [join(ctx.directory, 'pipe.gitconfig')]);

  expect(
    nodeHookFactsFiles.readText(join(ctx.directory, 'pipe.gitconfig')),
  ).rejects.toThrowWithMessage(Error, /is not a regular file/u);
});

test('it rejects a file larger than a git config it reads', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'large.gitconfig'), Buffer.alloc(1_048_577, 0x23));

  expect(
    nodeHookFactsFiles.readText(join(ctx.directory, 'large.gitconfig')),
  ).rejects.toThrowWithMessage(Error, /larger than a git config/u);
});

test('it reads a file at the size limit', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'full.gitconfig'), Buffer.alloc(1_048_576, 0x23));

  const text = await nodeHookFactsFiles.readText(join(ctx.directory, 'full.gitconfig'));

  expect(text).toHaveLength(1_048_576);
});

test('it rejects a file that holds more than its size shows', () => {
  expect(nodeHookFactsFiles.readText('/proc/self/status')).rejects.toThrowWithMessage(
    Error,
    /grew while this reader read it/u,
  );
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
