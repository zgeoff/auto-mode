import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { makeJudgeServerSession } from './make-judge-server-session.ts';
import { startJudgeServer } from './start-judge-server.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-judge-client-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  await mkdir(binDir);

  // the SDK runs the `claude` it finds on the PATH a test passes, so the stub stands in for it
  await writeFile(
    join(binDir, 'claude'),
    `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, '..', '..', 'test-utils', 'run-stub-claude.ts')}" "$@"\n`,
    { mode: 0o755 },
  );

  return {
    directory,
    binDir,
    socketPath: join(directory, 'judge.sock'),
    stubServer: join(import.meta.dir, '..', '..', 'test-utils', 'run-stub-judge-server.ts'),
  };
}

test('it starts the judge server when none answers, and a later review reaches the same server', async () => {
  const ctx = await setupTest();

  const serversPath = join(ctx.directory, 'servers.jsonl');

  const target = {
    socketPath: ctx.socketPath,
    command: [process.execPath, ctx.stubServer] as const,
    env: {
      PATH: ctx.binDir,
      STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It pushes to main."}',
      STUB_JUDGE_SERVER_RECORD: serversPath,
      STUB_JUDGE_SERVER_IDLE_MS: '500',
    },
    timeoutMs: 10_000,
  };

  await makeJudgeServerSession(target).review(
    'claude-haiku-5-5',
    { system: 'the judge policy', user: 'the first evidence' },
    AbortSignal.timeout(10_000),
  );

  const second = await makeJudgeServerSession(target).review(
    'claude-haiku-5-5',
    { system: 'the judge policy', user: 'the second evidence' },
    AbortSignal.timeout(10_000),
  );

  const servers = await readFile(serversPath, 'utf8');

  expect(second.warm).toBeTrue();
  expect(servers.trim().split('\n')).toHaveLength(1);
});

test('it rejects with an AbortError when the server reports an aborted review', async () => {
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

  expect(
    makeJudgeServerSession({
      socketPath: ctx.socketPath,
      command: [process.execPath],
      env,
      timeoutMs: 200,
    }).review(
      'claude-haiku-5-5',
      { system: 'the judge policy', user: 'the evidence' },
      AbortSignal.timeout(10_000),
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
});

test('it rejects with the server’s message when the review fails', async () => {
  const ctx = await setupTest();

  const env = {
    PATH: ctx.binDir,
    STUB_CLAUDE_REPLY: '{}',
    STUB_CLAUDE_IS_ERROR: 'true',
  };

  const server = await startJudgeServer({ socketPath: ctx.socketPath, env, idleMs: 60_000 });

  invariant(server);

  onTestFinished(() => {
    server.stop();
  });

  expect(
    makeJudgeServerSession({
      socketPath: ctx.socketPath,
      command: [process.execPath],
      env,
      timeoutMs: 10_000,
    }).review(
      'claude-haiku-5-5',
      { system: 'the judge policy', user: 'the evidence' },
      AbortSignal.timeout(10_000),
    ),
  ).rejects.toThrow(Error);
});

test('it stops waiting for a server that never starts when the caller aborts', async () => {
  const ctx = await setupTest();

  expect(
    makeJudgeServerSession({
      socketPath: ctx.socketPath,
      command: [process.execPath, '--eval', ''],
      env: { PATH: ctx.binDir },
      timeoutMs: 10_000,
    }).review(
      'claude-haiku-5-5',
      { system: 'the judge policy', user: 'the evidence' },
      AbortSignal.timeout(200),
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
