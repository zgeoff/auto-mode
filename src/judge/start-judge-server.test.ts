import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { waitFor } from '../../test-utils/wait-for.ts';
import { makeJudgeServerSession } from './make-judge-server-session.ts';
import { startJudgeServer } from './start-judge-server.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-judge-server-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  await mkdir(binDir);

  // the SDK runs the `claude` it finds on the PATH a test passes, so the stub stands in for it
  await writeFile(
    join(binDir, 'claude'),
    `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, '..', '..', 'test-utils', 'run-stub-claude.ts')}" "$@"\n`,
    { mode: 0o755 },
  );

  return { directory, binDir, socketPath: join(directory, 'run', 'judge.sock') };
}

test('it answers each review on its socket from one warm judge process', async () => {
  const ctx = await setupTest();

  const recordPath = join(ctx.directory, 'calls.jsonl');

  const env = {
    PATH: ctx.binDir,
    STUB_CLAUDE_RECORD: recordPath,
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It deletes the branch."}',
  };

  const server = await startJudgeServer({ socketPath: ctx.socketPath, env, idleMs: 60_000 });

  invariant(server);

  onTestFinished(() => {
    server.stop();
  });

  const client = makeJudgeServerSession({
    socketPath: ctx.socketPath,
    command: [process.execPath],
    env,
    timeoutMs: 10_000,
  });

  await client.review(
    'claude-haiku-5-5',
    { system: 'the judge policy', user: 'the first evidence' },
    AbortSignal.timeout(10_000),
  );

  const second = await client.review(
    'claude-haiku-5-5',
    { system: 'the judge policy', user: 'the second evidence' },
    AbortSignal.timeout(10_000),
  );

  const recorded = await readFile(recordPath, 'utf8');

  const pids = recorded
    .trim()
    .split('\n')
    .map((line) => z.object({ pid: z.number() }).parse(JSON.parse(line)).pid);

  expect(second).toStrictEqual({
    text: '{"verdict":"confirm","basis":null,"reason":"It deletes the branch."}',
    model: 'claude-haiku-5-5',
    safetyStops: null,
    fallback: false,
    warm: true,
  });

  expect(new Set(pids).size).toBe(1);
});

test('it keeps its socket and its directory private to the user', async () => {
  const ctx = await setupTest();

  const server = await startJudgeServer({
    socketPath: ctx.socketPath,
    env: { PATH: ctx.binDir },
    idleMs: 60_000,
  });

  invariant(server);

  onTestFinished(() => {
    server.stop();
  });

  const socketStat = await stat(ctx.socketPath);
  const dirStat = await stat(join(ctx.directory, 'run'));

  expect(socketStat.mode & 0o777).toBe(0o600);
  expect(dirStat.mode & 0o777).toBe(0o700);
});

test('it answers a request that is not a review with a failure', async () => {
  const ctx = await setupTest();

  const server = await startJudgeServer({
    socketPath: ctx.socketPath,
    env: { PATH: ctx.binDir },
    idleMs: 60_000,
  });

  invariant(server);

  onTestFinished(() => {
    server.stop();
  });

  const socket = connect(ctx.socketPath);

  socket.write('{"model":"claude-haiku-5-5"}\n');

  const answer = await text(socket);

  expect(JSON.parse(answer)).toStrictEqual({
    kind: 'failure',
    aborted: false,
    message: 'malformed request',
  });
});

test('it fails a review that outlasts its timeout as aborted', async () => {
  const ctx = await setupTest();

  const env = {
    PATH: ctx.binDir,
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"Slow."}',
    STUB_CLAUDE_DELAY_MS: '60000',
  };

  const server = await startJudgeServer({ socketPath: ctx.socketPath, env, idleMs: 60_000 });

  invariant(server);

  onTestFinished(() => {
    server.stop();
  });

  const socket = connect(ctx.socketPath);

  socket.write(
    `${JSON.stringify({ model: 'claude-haiku-5-5', timeoutMs: 200, system: 'the judge policy', user: 'the evidence' })}\n`,
  );

  const answer = await text(socket);

  expect(JSON.parse(answer)).toMatchObject({ kind: 'failure', aborted: true });
});

test('it stops the judge process of a review whose client goes away', async () => {
  const ctx = await setupTest();

  const recordPath = join(ctx.directory, 'calls.jsonl');

  const env = {
    PATH: ctx.binDir,
    STUB_CLAUDE_RECORD: recordPath,
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"Slow."}',
    STUB_CLAUDE_DELAY_MS: '60000',
  };

  const server = await startJudgeServer({ socketPath: ctx.socketPath, env, idleMs: 60_000 });

  invariant(server);

  onTestFinished(() => {
    server.stop();
  });

  const socket = connect(ctx.socketPath);

  socket.write(
    `${JSON.stringify({ model: 'claude-haiku-5-5', timeoutMs: 60_000, system: 'the judge policy', user: 'the evidence' })}\n`,
  );

  const recorded = await waitFor(
    () => (existsSync(recordPath) ? readFile(recordPath, 'utf8') : ''),
    (content) => content.includes('\n'),
    { timeoutMs: 10_000 },
  );

  const pid = z.object({ pid: z.number() }).parse(JSON.parse(recorded)).pid;

  socket.destroy();

  const running = await waitFor(
    () => existsSync(`/proc/${String(pid)}`),
    (exists) => !exists,
    { timeoutMs: 10_000 },
  );

  expect(running).toBeFalse();
});

test('it leaves in place a socket that another server put over its own', async () => {
  const ctx = await setupTest();

  const server = await startJudgeServer({
    socketPath: ctx.socketPath,
    env: { PATH: ctx.binDir },
    idleMs: 60_000,
  });

  invariant(server);

  onTestFinished(() => {
    server.stop();
  });

  await rm(ctx.socketPath);
  await writeFile(ctx.socketPath, 'the newer server');

  server.stop();

  await server.closed;

  const left = await readFile(ctx.socketPath, 'utf8');

  expect(left).toBe('the newer server');
});

test('it answers a review that connects while the server starts', async () => {
  const ctx = await setupTest();

  const env = {
    PATH: ctx.binDir,
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"Early."}',
  };

  const starting = startJudgeServer({ socketPath: ctx.socketPath, env, idleMs: 60_000 });

  onTestFinished(async () => {
    const server = await starting;

    server?.stop();
  });

  const reply = await makeJudgeServerSession({
    socketPath: ctx.socketPath,
    command: [process.execPath, '--eval', ''],
    env,
    timeoutMs: 10_000,
  }).review(
    'claude-haiku-5-5',
    { system: 'the judge policy', user: 'the evidence' },
    AbortSignal.timeout(10_000),
  );

  expect(reply.text).toBe('{"verdict":"confirm","basis":null,"reason":"Early."}');
});

test('it leaves the socket to a server that already answers on it', async () => {
  const ctx = await setupTest();

  const first = await startJudgeServer({
    socketPath: ctx.socketPath,
    env: { PATH: ctx.binDir },
    idleMs: 60_000,
  });

  invariant(first);

  onTestFinished(() => {
    first.stop();
  });

  const second = await startJudgeServer({
    socketPath: ctx.socketPath,
    env: { PATH: ctx.binDir },
    idleMs: 60_000,
  });

  expect(second).toBeNull();
});

test('it replaces a socket file that no server answers on', async () => {
  const ctx = await setupTest();

  const env = {
    PATH: ctx.binDir,
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It reads a secret."}',
  };

  await mkdir(join(ctx.directory, 'run'));
  await writeFile(ctx.socketPath, '');

  const server = await startJudgeServer({ socketPath: ctx.socketPath, env, idleMs: 60_000 });

  invariant(server);

  onTestFinished(() => {
    server.stop();
  });

  const reply = await makeJudgeServerSession({
    socketPath: ctx.socketPath,
    command: [process.execPath],
    env,
    timeoutMs: 10_000,
  }).review(
    'claude-haiku-5-5',
    { system: 'the judge policy', user: 'the evidence' },
    AbortSignal.timeout(10_000),
  );

  expect(reply.text).toBe('{"verdict":"confirm","basis":null,"reason":"It reads a secret."}');
});

test('it closes and removes its socket once it has been idle for the idle period', async () => {
  const ctx = await setupTest();

  const server = await startJudgeServer({
    socketPath: ctx.socketPath,
    env: { PATH: ctx.binDir },
    idleMs: 50,
  });

  invariant(server);

  onTestFinished(() => {
    server.stop();
  });

  await server.closed;

  expect(existsSync(ctx.socketPath)).toBeFalse();
});
