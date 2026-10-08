import { expect, mock, onTestFinished, test } from 'bun:test';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import { loadProcessState } from '../../test-utils/load-process-state.ts';
import { readApiKeyFromCommand } from './read-api-key-from-command.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-key-command-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const socketPath = join(dir, 'ready.sock');
  const report = Promise.withResolvers<string>();

  const server = createServer((socket) => {
    report.resolve(text(socket));
  });

  server.listen(socketPath);

  await once(server, 'listening');

  onTestFinished(() => {
    server.close();

    return once(server, 'close');
  });

  return { socketPath, report: report.promise };
}

test('it stops a key helper and its child on cancellation', async () => {
  const ctx = await setupTest();

  const helper = join(import.meta.dir, '..', '..', 'test-utils', 'run-stub-key-helper.ts');

  const controller = new AbortController();

  const result = readApiKeyFromCommand(`"${process.execPath}" "${helper}" "${ctx.socketPath}"`, {
    signal: controller.signal,
  });

  onTestFinished(() => {
    controller.abort();
  });

  const body = await ctx.report;

  const pids = z.object({ helper: z.number(), child: z.number() }).parse(JSON.parse(body));

  const helperBefore = await loadProcessState(pids.helper);
  const childBefore = await loadProcessState(pids.child);

  invariant(helperBefore !== null && childBefore !== null, 'the helper and its child run');

  controller.abort();

  const key = await result;
  const helperAfter = await loadProcessState(pids.helper);
  const childAfter = await loadProcessState(pids.child);

  expect(key).toBeNull();
  expect(helperBefore.state).toBeOneOf(['R', 'S']);
  expect(childBefore.state).toBeOneOf(['R', 'S']);

  // A stopped process is gone or a zombie awaiting its reaper; the start time
  // keeps a reused process ID from passing as the stopped one.
  expect(helperAfter).toBeOneOf([
    null,
    { ...helperBefore, state: 'Z' },
    { ...helperBefore, state: 'X' },
  ]);

  expect(childAfter).toBeOneOf([
    null,
    { ...childBefore, state: 'Z' },
    { ...childBefore, state: 'X' },
  ]);
});

test('it reads the trimmed key the helper prints', async () => {
  const key = await readApiKeyFromCommand(String.raw`printf '  offline-test-key\n'`);

  expect(key).toBe('offline-test-key');
});

test('it reads no key from a helper that exits with an error', async () => {
  const key = await readApiKeyFromCommand('printf offline-test-key; exit 1');

  expect(key).toBeNull();
});

test('it reads no key from a helper that prints only whitespace', async () => {
  const key = await readApiKeyFromCommand(String.raw`printf '  \n'`);

  expect(key).toBeNull();
});

test('it reads no key from a helper that prints more than 64 KiB', async () => {
  const key = await readApiKeyFromCommand(String.raw`head -c 65537 /dev/zero | tr '\0' x`);

  expect(key).toBeNull();
});

test('it runs the helper with the host environment it is given', async () => {
  const key = await readApiKeyFromCommand('printf %s "$AUTO_MODE_HELPER_KEY"', {
    host: buildMockHostEnvironment({ env: { AUTO_MODE_HELPER_KEY: 'from-host' } }),
  });

  expect(key).toBe('from-host');
});

test('it runs the helper with the given home', async () => {
  const key = await readApiKeyFromCommand('printf %s "$HOME"', {
    host: buildMockHostEnvironment({ env: {}, home: '/home/test' }),
  });

  expect(key).toBe('/home/test');
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

test('it starts no key helper once the caller has cancelled', async () => {
  const timeout = mock<(ms: number) => AbortSignal>(() => new AbortController().signal);

  const key = await readApiKeyFromCommand('printf offline-test-key', {
    signal: AbortSignal.abort(),
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
