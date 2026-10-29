import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile } from '../config/read-text-file.ts';
import { probeLauncherSpawner } from './probe-launcher-spawner.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'launcher-spawner-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it finds a spawner when the scope file lists a reply channel', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(
    path,
    JSON.stringify({
      format: 'auto-mode.scope',
      version: 1,
      replyChannels: [
        { tool: 'mcp__atc__atc_message_send', field: 'session', recipient: 's-lead' },
      ],
    }),
  );

  const isSpawned = await probeLauncherSpawner(path, readTextFile);

  expect(isSpawned).toBe(true);
});

test('it finds no spawner when the scope file lists no reply channel', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(
    path,
    JSON.stringify({ format: 'auto-mode.scope', version: 1, paths: ['/srv/a'] }),
  );

  const isSpawned = await probeLauncherSpawner(path, readTextFile);

  expect(isSpawned).toBe(false);
});

test('it finds no spawner when no launcher names a scope file', async () => {
  const isSpawned = await probeLauncherSpawner(undefined, readTextFile);

  expect(isSpawned).toBe(false);
});

test('it finds no spawner when the named scope file does not exist', async () => {
  const ctx = await setupTest();
  const isSpawned = await probeLauncherSpawner(join(ctx.directory, 'missing.json'), readTextFile);

  expect(isSpawned).toBe(false);
});

test('it counts a malformed scope file as naming a spawner', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'scope.json');

  await writeFile(path, '{"format":"auto-mode.scope","version":1,"spawner":"s-lead"}');

  const isSpawned = await probeLauncherSpawner(path, readTextFile);

  expect(isSpawned).toBe(true);
});
