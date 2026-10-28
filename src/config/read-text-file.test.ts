import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile } from './read-text-file.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-read-text-file-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads a file as UTF-8 text', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(path, '{ "note": "café" }');

  const text = await readTextFile(path);

  expect(text).toBe('{ "note": "café" }');
});

test('it rejects with the error code of a missing file', async () => {
  const ctx = await setupTest();

  expect(readTextFile(join(ctx.directory, 'missing.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
