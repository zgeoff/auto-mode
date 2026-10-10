import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-stub-claude-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, recordPath: join(dir, 'calls.jsonl') };
}

test('it prints its reply as a successful claude -p JSON result', () => {
  const result = spawnSync(
    process.execPath,
    [join(import.meta.dir, 'run-stub-claude.ts'), '-p', '--output-format', 'json'],
    { input: 'the prompt', encoding: 'utf8', env: { STUB_CLAUDE_REPLY: 'the answer' } },
  );

  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 0,
    stdout: `${JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      duration_ms: 1,
      num_turns: 1,
      result: 'the answer',
      session_id: '00000000-0000-4000-8000-000000000000',
    })}\n`,
    stderr: '',
  });
});

test('it appends its arguments, stdin, cwd, and provider variables to the record file', async () => {
  const ctx = await setupTest();

  const result = spawnSync(
    process.execPath,
    [join(import.meta.dir, 'run-stub-claude.ts'), '-p', '--tools', ''],
    {
      input: 'line one\nline two',
      cwd: ctx.dir,
      encoding: 'utf8',
      env: {
        STUB_CLAUDE_RECORD: ctx.recordPath,
        ANTHROPIC_BASE_URL: 'https://proxy.test',
        MAX_THINKING_TOKENS: '0',
      },
    },
  );

  const record = await readFile(ctx.recordPath, 'utf8');

  expect(result.status).toBe(0);

  expect(
    record
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line)),
  ).toStrictEqual([
    {
      pid: result.pid,
      cwd: ctx.dir,
      argv: ['-p', '--tools', ''],
      stdin: 'line one\nline two',
      env: { ANTHROPIC_BASE_URL: 'https://proxy.test', MAX_THINKING_TOKENS: '0' },
    },
  ]);
});

test('it prints an error result when the error control is set', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-claude.ts')], {
    input: '',
    encoding: 'utf8',
    env: { STUB_CLAUDE_IS_ERROR: 'true', STUB_CLAUDE_REPLY: 'API Error: 401' },
  });

  expect(JSON.parse(result.stdout)).toMatchObject({
    subtype: 'error_during_execution',
    is_error: true,
    result: 'API Error: 401',
  });
});

test('it exits with the code its control names after printing its result', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-claude.ts')], {
    input: '',
    encoding: 'utf8',
    env: { STUB_CLAUDE_EXIT_CODE: '3', STUB_CLAUDE_REPLY: 'late' },
  });

  const body: unknown = JSON.parse(result.stdout);

  expect(result.status).toBe(3);
  expect(body).toMatchObject({ result: 'late' });
});

test('it prints its result only once the delay its control names has passed', () => {
  const startedAt = performance.now();

  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-claude.ts')], {
    input: '',
    encoding: 'utf8',
    env: { STUB_CLAUDE_DELAY_MS: '300', STUB_CLAUDE_REPLY: 'slow' },
  });

  const elapsedMs = performance.now() - startedAt;

  expect(JSON.parse(result.stdout)).toMatchObject({ result: 'slow' });
  expect(elapsedMs).toBeGreaterThanOrEqual(300);
});
