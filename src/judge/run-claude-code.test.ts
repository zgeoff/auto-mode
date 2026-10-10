import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import { loadProcessState } from '../../test-utils/load-process-state.ts';
import { waitFor } from '../../test-utils/wait-for.ts';
import { runClaudeCode } from './run-claude-code.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-run-claude-code-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const binDir = join(dir, 'bin');

  await mkdir(binDir);

  // the child finds `claude` through the PATH a test passes, so the stub stands in for it
  await writeFile(
    join(binDir, 'claude'),
    `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, '..', '..', 'test-utils', 'run-stub-claude.ts')}" "$@"\n`,
    { mode: 0o755 },
  );

  return { binDir, recordPath: join(dir, 'calls.jsonl') };
}

test('it returns the result text of the claude run with the configured model', async () => {
  const ctx = await setupTest();

  const reply = await runClaudeCode(
    buildMockProviderConfig({ protocol: 'claude-code', model: 'claude-haiku-5-5' }),
    { system: 'the judge policy', user: 'the evidence' },
    {
      PATH: ctx.binDir,
      STUB_CLAUDE_REPLY: '<verdict>confirm</verdict><reason>It sends the key.</reason>',
    },
    AbortSignal.timeout(10_000),
  );

  expect(reply).toStrictEqual({
    text: '<verdict>confirm</verdict><reason>It sends the key.</reason>',
    model: 'claude-haiku-5-5',
  });
});

test('it runs claude -p with the model, the system prompt, no tools, no settings, and the evidence on stdin', async () => {
  const ctx = await setupTest();

  await runClaudeCode(
    buildMockProviderConfig({ protocol: 'claude-code', model: 'claude-haiku-5-5' }),
    { system: 'the judge policy\nwith two lines', user: 'the evidence' },
    { PATH: ctx.binDir, STUB_CLAUDE_RECORD: ctx.recordPath, STUB_CLAUDE_REPLY: 'ok' },
    AbortSignal.timeout(10_000),
  );

  const record = await readFile(ctx.recordPath, 'utf8');

  expect(JSON.parse(record)).toStrictEqual({
    pid: expect.toBeNumber(),
    cwd: await realpath(tmpdir()),
    argv: [
      '-p',
      '--model',
      'claude-haiku-5-5',
      '--system-prompt',
      'the judge policy\nwith two lines',
      '--tools',
      '',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--no-session-persistence',
      '--output-format',
      'json',
    ],
    stdin: 'the evidence',
    env: { MAX_THINKING_TOKENS: '0' },
  });
});

test('it removes the session provider variables and turns thinking off in the child environment', async () => {
  const ctx = await setupTest();

  await runClaudeCode(
    buildMockProviderConfig({ protocol: 'claude-code' }),
    { system: 'the judge policy', user: 'the evidence' },
    {
      PATH: ctx.binDir,
      STUB_CLAUDE_RECORD: ctx.recordPath,
      STUB_CLAUDE_REPLY: 'ok',
      ANTHROPIC_API_KEY: 'sk-other-provider',
      ANTHROPIC_BASE_URL: 'https://proxy.test',
      CLAUDE_CODE_USE_BEDROCK: '1',
      MAX_THINKING_TOKENS: '31999',
    },
    AbortSignal.timeout(10_000),
  );

  const recorded = await readFile(ctx.recordPath, 'utf8');

  const record = z.object({ env: z.record(z.string(), z.string()) }).parse(JSON.parse(recorded));

  expect(record.env).toStrictEqual({ MAX_THINKING_TOKENS: '0' });
});

test('it fails when claude exits with a non-zero code', async () => {
  const ctx = await setupTest();

  expect(
    runClaudeCode(
      buildMockProviderConfig({ protocol: 'claude-code' }),
      { system: 'the judge policy', user: 'the evidence' },
      { PATH: ctx.binDir, STUB_CLAUDE_REPLY: 'ok', STUB_CLAUDE_EXIT_CODE: '1' },
      AbortSignal.timeout(10_000),
    ),
  ).rejects.toThrowWithMessage(Error, 'claude -p failed with exit code 1');
});

test('it fails when claude reports an error result', async () => {
  const ctx = await setupTest();

  expect(
    runClaudeCode(
      buildMockProviderConfig({ protocol: 'claude-code' }),
      { system: 'the judge policy', user: 'the evidence' },
      { PATH: ctx.binDir, STUB_CLAUDE_REPLY: 'Not logged in', STUB_CLAUDE_IS_ERROR: 'true' },
      AbortSignal.timeout(10_000),
    ),
  ).rejects.toThrowWithMessage(Error, 'claude -p failed with exit code 0');
});

test('it fails when no claude is on the PATH', async () => {
  const ctx = await setupTest();

  expect(
    runClaudeCode(
      buildMockProviderConfig({ protocol: 'claude-code' }),
      { system: 'the judge policy', user: 'the evidence' },
      { PATH: join(ctx.binDir, 'missing') },
      AbortSignal.timeout(10_000),
    ),
  ).rejects.toThrow();
});

test('it kills a claude run that is still going when the signal aborts', async () => {
  const ctx = await setupTest();

  const controller = new AbortController();

  const run = runClaudeCode(
    buildMockProviderConfig({ protocol: 'claude-code' }),
    { system: 'the judge policy', user: 'the evidence' },
    {
      PATH: ctx.binDir,
      STUB_CLAUDE_RECORD: ctx.recordPath,
      STUB_CLAUDE_REPLY: 'too late',
      STUB_CLAUDE_DELAY_MS: '60000',
    },
    controller.signal,
  );

  const started = await waitFor(
    () => readFile(ctx.recordPath, 'utf8').catch(() => ''),
    (text) => text !== '',
    { timeoutMs: 10_000 },
  );

  const record = z.object({ pid: z.number() }).parse(JSON.parse(started));

  controller.abort();

  await expect(run).toReject();

  const state = await waitFor(
    () => loadProcessState(record.pid),
    (value) => value === null,
  );

  expect(state).toBeNull();
});
