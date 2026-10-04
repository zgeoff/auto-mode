import { expect, test } from 'bun:test';
import { watch } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { readApiKeyFromCommand } from './read-api-key-from-command.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-key-command-'));

  let watcher: ReturnType<typeof watch>;

  const ready = new Promise<void>((resolve, reject) => {
    watcher = watch(dir, (_event, filename) => {
      if (filename === 'ready.json') {
        resolve();
      }
    });

    watcher.on('error', reject);
  });

  return {
    dir,
    ready,
    async [Symbol.asyncDispose]() {
      watcher.close();

      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('it stops a key helper and its child on cancellation', async () => {
  await using ctx = await setupTest();

  const helper = join(ctx.dir, 'helper.cjs');
  const readyPath = join(ctx.dir, 'ready.json');

  await writeFile(
    helper,
    `const fs = require('node:fs');
const child = require('node:child_process').spawn('/bin/sh', ['-c', 'sleep 30'], {stdio:'ignore'});
fs.writeFileSync('${readyPath}.tmp', JSON.stringify({helper:process.pid, child:child.pid}));
fs.renameSync('${readyPath}.tmp', '${readyPath}');
setTimeout(() => console.log('offline-test-key'), 30000);
`,
  );

  const controller = new AbortController();

  const result = readApiKeyFromCommand(`${process.execPath} ${helper}`, {
    signal: controller.signal,
  });

  await ctx.ready;

  const readyJSON = await readFile(readyPath, 'utf8');

  const pidSchema = z.object({
    helper: z.number().int().positive(),
    child: z.number().int().positive(),
  });

  const pids = pidSchema.parse(JSON.parse(readyJSON));

  controller.abort();

  const key = await result;

  const helperState = await readFile(`/proc/${pids.helper}/stat`, 'utf8').catch(
    (error: unknown) => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error;
      }

      return '';
    },
  );

  const childState = await readFile(`/proc/${pids.child}/stat`, 'utf8').catch((error: unknown) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }

    return '';
  });

  expect(key).toBeNull();
  expect(helperState).toMatch(/^(?:$|.*\) [ZX] )/u);
  expect(childState).toMatch(/^(?:$|.*\) [ZX] )/u);
});

test('it limits a key helper to the shared deadline', async () => {
  const started = performance.now();

  const key = await readApiKeyFromCommand('sleep 30; printf offline-test-key', {
    deadlineAt: Date.now() + 100,
  });

  expect(key).toBeNull();
  expect(performance.now() - started).toBeLessThan(1000);
});
