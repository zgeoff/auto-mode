import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-stub-claude-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, recordPath: join(directory, 'calls.jsonl') };
}

test('it answers initialize with a control response and a review with an init and a result that holds the reply', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-claude.ts')], {
    input: [
      JSON.stringify({
        type: 'control_request',
        request_id: 'req-1',
        request: { subtype: 'initialize', systemPrompt: ['the policy'] },
      }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'the evidence' } }),
    ].join('\n'),
    encoding: 'utf8',
    env: { STUB_CLAUDE_REPLY: '{"verdict":"confirm"}' },
  });

  expect(
    result.stdout
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line)),
  ).toStrictEqual([
    {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'req-1',
        response: { pid: result.pid, commands: [], models: [], agents: [] },
      },
    },
    {
      type: 'system',
      subtype: 'init',
      session_id: '00000000-0000-4000-8000-000000000000',
      model: 'stub',
      tools: [],
    },
    {
      type: 'result',
      subtype: 'success',
      is_error: false,
      duration_ms: 1,
      duration_api_ms: 1,
      num_turns: 1,
      stop_reason: 'end_turn',
      session_id: '00000000-0000-4000-8000-000000000000',
      total_cost_usd: 0,
      usage: {},
      modelUsage: {},
      permission_denials: [],
      uuid: '00000000-0000-4000-8000-000000000001',
      result: '{"verdict":"confirm"}',
    },
  ]);
});

test('it answers a /clear line with an empty result', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-claude.ts')], {
    input: JSON.stringify({ type: 'user', message: { role: 'user', content: '/clear' } }),
    encoding: 'utf8',
    env: { STUB_CLAUDE_REPLY: '{"verdict":"confirm"}' },
  });

  const [, cleared] = result.stdout.trim().split('\n');

  invariant(cleared !== undefined);

  expect(JSON.parse(cleared)).toMatchObject({ type: 'result', result: '' });
});

test('it adds the model usage and the safety stops its controls name to the result', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-claude.ts')], {
    input: JSON.stringify({ type: 'user', message: { role: 'user', content: 'the evidence' } }),
    encoding: 'utf8',
    env: {
      STUB_CLAUDE_REPLY: '{}',
      STUB_CLAUDE_MODEL_USAGE:
        '{"claude-opus-9":{"outputTokens":0},"claude-opus-8":{"outputTokens":40}}',
      STUB_CLAUDE_SAFETY_STOPS: '1',
    },
  });

  const [, reply] = result.stdout.trim().split('\n');

  expect(JSON.parse(reply ?? '')).toMatchObject({
    modelUsage: { 'claude-opus-9': { outputTokens: 0 }, 'claude-opus-8': { outputTokens: 40 } },
    safety_stops: 1,
  });
});

test('it reports a refusal fallback to the model its control names before the result', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-claude.ts')], {
    input: JSON.stringify({ type: 'user', message: { role: 'user', content: 'the evidence' } }),
    encoding: 'utf8',
    env: { STUB_CLAUDE_REPLY: '{}', STUB_CLAUDE_REFUSAL_FALLBACK: 'claude-opus-8' },
  });

  const [, fallback, reply] = result.stdout.trim().split('\n');

  expect(JSON.parse(fallback ?? '')).toMatchObject({
    type: 'system',
    subtype: 'model_refusal_fallback',
    scope: 'session',
    fallback_model: 'claude-opus-8',
  });

  expect(JSON.parse(reply ?? '')).toMatchObject({ type: 'result' });
});

test('it appends each review with its process, its count, the clears before it, the system prompt and the provider variables to the record file', async () => {
  const ctx = await setupTest();

  const result = spawnSync(
    process.execPath,
    [join(import.meta.dir, 'run-stub-claude.ts'), '--tools='],
    {
      input: [
        JSON.stringify({
          type: 'control_request',
          request_id: 'req-1',
          request: { subtype: 'initialize', systemPrompt: ['the policy'] },
        }),
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'first' } }),
        JSON.stringify({ type: 'user', message: { role: 'user', content: '/clear' } }),
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'second' } }),
      ].join('\n'),
      cwd: ctx.directory,
      encoding: 'utf8',
      env: { STUB_CLAUDE_RECORD: ctx.recordPath, ANTHROPIC_BASE_URL: 'https://proxy.test' },
    },
  );

  const record = await readFile(ctx.recordPath, 'utf8');

  expect(
    record
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line)),
  ).toStrictEqual([
    {
      pid: result.pid,
      review: 1,
      clears: 0,
      cwd: ctx.directory,
      argv: ['--tools='],
      system: ['the policy'],
      user: 'first',
      env: { ANTHROPIC_BASE_URL: 'https://proxy.test' },
    },
    {
      pid: result.pid,
      review: 2,
      clears: 1,
      cwd: ctx.directory,
      argv: ['--tools='],
      system: ['the policy'],
      user: 'second',
      env: { ANTHROPIC_BASE_URL: 'https://proxy.test' },
    },
  ]);
});

test('it pads the reply with spaces to the byte count its control names', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-claude.ts')], {
    input: JSON.stringify({ type: 'user', message: { role: 'user', content: 'the evidence' } }),
    encoding: 'utf8',
    env: { STUB_CLAUDE_REPLY: '{}', STUB_CLAUDE_REPLY_BYTES: '6' },
  });

  const [, reply] = result.stdout.trim().split('\n');

  invariant(reply !== undefined);

  expect(JSON.parse(reply)).toMatchObject({ result: '{}    ' });
});

test('it prints an error result when the error control is set', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-claude.ts')], {
    input: JSON.stringify({ type: 'user', message: { role: 'user', content: 'the evidence' } }),
    encoding: 'utf8',
    env: { STUB_CLAUDE_IS_ERROR: 'true', STUB_CLAUDE_REPLY: '{}' },
  });

  const [, reply] = result.stdout.trim().split('\n');

  invariant(reply !== undefined);

  expect(JSON.parse(reply)).toMatchObject({ subtype: 'error_during_execution', is_error: true });
});

test('it exits during its first review when the crash control is set', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-claude.ts')], {
    input: JSON.stringify({ type: 'user', message: { role: 'user', content: 'the evidence' } }),
    encoding: 'utf8',
    env: { STUB_CLAUDE_CRASH: 'true', STUB_CLAUDE_REPLY: '{}' },
  });

  expect(result.status).toBe(1);
  expect(result.stdout.trim().split('\n')).toHaveLength(1);
});

test('it prints its result only once the delay its control names has passed', () => {
  const startedAt = performance.now();

  const result = spawnSync(process.execPath, [join(import.meta.dir, 'run-stub-claude.ts')], {
    input: JSON.stringify({ type: 'user', message: { role: 'user', content: 'the evidence' } }),
    encoding: 'utf8',
    env: { STUB_CLAUDE_DELAY_MS: '300', STUB_CLAUDE_REPLY: '{}' },
  });

  const elapsedMs = performance.now() - startedAt;

  expect(result.stdout.trim().split('\n')).toHaveLength(2);
  expect(elapsedMs).toBeGreaterThanOrEqual(300);
});
