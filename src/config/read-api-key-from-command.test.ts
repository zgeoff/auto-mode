import { expect, mock, test } from 'bun:test';
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
  const now = Date.now();

  const timer = new AbortController();

  const timeout = mock<(ms: number) => AbortSignal>(() => timer.signal);

  const result = readApiKeyFromCommand('sleep 30; printf offline-test-key', {
    deadlineAt: now + 100,
    now: () => now,
    timeout,
  });

  timer.abort();

  const key = await result;

  expect(key).toBeNull();
  expect(timeout).toHaveBeenCalledExactlyOnceWith(100);
});

test('it limits a key helper to 5 s without a shared deadline', async () => {
  const timer = new AbortController();

  const timeout = mock<(ms: number) => AbortSignal>(() => timer.signal);
  const result = readApiKeyFromCommand('sleep 30; printf offline-test-key', { timeout });

  timer.abort();

  const key = await result;

  expect(key).toBeNull();
  expect(timeout).toHaveBeenCalledExactlyOnceWith(5000);
});

test('it starts no key helper once the shared deadline has passed', async () => {
  const now = Date.now();
  const timeout = mock<(ms: number) => AbortSignal>(() => new AbortController().signal);

  const key = await readApiKeyFromCommand('printf offline-test-key', {
    deadlineAt: now,
    now: () => now,
    timeout,
  });

  expect(key).toBeNull();
  expect(timeout).not.toHaveBeenCalled();
});

test('it stops a key helper at once when its timer has already fired', async () => {
  const key = await readApiKeyFromCommand('sleep 30; printf offline-test-key', {
    timeout: () => AbortSignal.abort(),
  });

  expect(key).toBeNull();
});
