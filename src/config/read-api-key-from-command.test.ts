import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { readApiKeyFromCommand } from './read-api-key-from-command.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-key-command-'));

  let acceptReady: (value: string) => void;

  const ready = new Promise<string>((resolve) => {
    acceptReady = resolve;
  });

  const server = createServer((socket) => {
    let body = '';

    socket.setEncoding('utf8');

    socket.on('data', (chunk: string) => {
      body += chunk;
    });

    socket.on('end', () => {
      acceptReady(body);

      socket.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(join(dir, 'ready.sock'), resolve);
  });

  return {
    dir,
    ready,
    async [Symbol.asyncDispose]() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('it stops a key helper and its child on cancellation', async () => {
  await using ctx = await setupTest();

  const helper = join(ctx.dir, 'helper.cjs');
  const readyPath = join(ctx.dir, 'ready.sock');

  await writeFile(
    helper,
    `const child = require('node:child_process').spawn('/bin/sh', ['-c', 'sleep 30'], {stdio:'ignore'});
const socket = require('node:net').connect('${readyPath}');
socket.on('connect', () => socket.end(JSON.stringify({helper:process.pid, child:child.pid})));
setTimeout(() => console.log('offline-test-key'), 30000);
`,
  );

  const controller = new AbortController();

  const result = readApiKeyFromCommand(`${process.execPath} ${helper}`, {
    signal: controller.signal,
  });

  const readyJSON = await ctx.ready;

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
