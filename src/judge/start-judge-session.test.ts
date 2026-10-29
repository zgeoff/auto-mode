import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { readStubClaudeRecords } from '../../test-utils/read-stub-claude-records.ts';
import { startJudgeSession } from './start-judge-session.ts';

async function setupTest(env: Readonly<Record<string, string>>) {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-judge-session-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  await mkdir(binDir);

  // the SDK runs the `claude` it finds on the PATH a test passes, so the stub stands in for it
  await writeFile(
    join(binDir, 'claude'),
    `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, '..', '..', 'test-utils', 'run-stub-claude.ts')}" "$@"\n`,
    { mode: 0o755 },
  );

  const recordPath = join(directory, 'calls.jsonl');
  const debugPath = join(directory, 'debug', 'judge.jsonl');

  const session = startJudgeSession({
    PATH: binDir,
    STUB_CLAUDE_RECORD: recordPath,
    AUTO_MODE_DEBUG_PATH: debugPath,
    ...env,
  });

  onTestFinished(() => {
    session.stop();
  });

  return { session, recordPath, debugPath };
}

test('it answers a review with the judge’s text on the configured model', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It sends the key."}',
  });

  const reply = await ctx.session.review(
    'claude-haiku-5-5',
    { system: 'the judge policy', user: 'the evidence' },
    AbortSignal.timeout(10_000),
  );

  expect(reply).toStrictEqual({
    text: '{"verdict":"confirm","basis":null,"reason":"It sends the key."}',
    model: 'claude-haiku-5-5',
    safetyStops: null,
    fallback: false,
    warm: false,
  });
});

test('it answers a second review from the same process, after clearing the first', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It force-pushes."}',
  });

  const model = 'claude-haiku-5-5';

  await ctx.session.review(
    model,
    { system: 'the judge policy', user: 'the first evidence' },
    AbortSignal.timeout(10_000),
  );

  const second = await ctx.session.review(
    model,
    { system: 'the judge policy', user: 'the second evidence' },
    AbortSignal.timeout(10_000),
  );

  const records = await readStubClaudeRecords(ctx.recordPath);

  expect(second.warm).toBeTrue();

  expect(records.map((record) => [record.review, record.clears, record.user])).toStrictEqual([
    [1, 0, 'the first evidence'],
    [2, 1, 'the second evidence'],
  ]);

  expect(new Set(records.map((record) => record.pid)).size).toBe(1);
});

test('it starts a new process when a review names another model', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It force-pushes."}',
  });

  await ctx.session.review(
    'claude-haiku-5-5',
    { system: 'the judge policy', user: 'the first evidence' },
    AbortSignal.timeout(10_000),
  );

  const second = await ctx.session.review(
    'claude-sonnet-5-5',
    { system: 'the judge policy', user: 'the second evidence' },
    AbortSignal.timeout(10_000),
  );

  const records = await readStubClaudeRecords(ctx.recordPath);

  expect(second.warm).toBeFalse();
  expect(new Set(records.map((record) => record.pid)).size).toBe(2);
});

test('it starts a new process when a review carries another system prompt', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It force-pushes."}',
  });

  const model = 'claude-haiku-5-5';

  await ctx.session.review(
    model,
    { system: 'the judge policy', user: 'the first evidence' },
    AbortSignal.timeout(10_000),
  );

  const second = await ctx.session.review(
    model,
    { system: 'the edited judge policy', user: 'the second evidence' },
    AbortSignal.timeout(10_000),
  );

  expect(second.warm).toBeFalse();
});

test('it sends the system prompt, no provider variables and a scratch directory to claude', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It force-pushes."}',
    ANTHROPIC_API_KEY: 'sk-gateway-test',
    ANTHROPIC_BASE_URL: 'https://gateway.example',
    CLAUDE_CODE_USE_BEDROCK: '1',
  });

  await ctx.session.review(
    'claude-haiku-5-5',
    { system: 'the judge policy', user: 'the evidence' },
    AbortSignal.timeout(10_000),
  );

  const records = await readStubClaudeRecords(ctx.recordPath);

  expect(records).toHaveLength(1);

  const [record] = records;

  invariant(record);

  const temporaryRoot = await realpath(tmpdir());

  expect(record.system).toStrictEqual(['the judge policy']);
  expect(record.env).toStrictEqual({});
  expect(record.cwd).toBe(temporaryRoot);

  expect(record.argv).toIncludeAllMembers([
    '--model=claude-haiku-5-5',
    '--thinking=disabled',
    '--tools=',
    '--setting-sources=',
    '--strict-mcp-config',
    '--no-session-persistence',
  ]);
});

test('it reports the fallback model that wrote the reply and starts a new process after a refusal fallback', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It posts the token."}',
    STUB_CLAUDE_REFUSAL_FALLBACK: 'claude-sonnet-5',
    STUB_CLAUDE_REPLY_MODEL: 'claude-sonnet-5',
    STUB_CLAUDE_MODEL_USAGE: JSON.stringify({
      'claude-sonnet-5-5': { inputTokens: 900, outputTokens: 0 },
      'claude-sonnet-5': { inputTokens: 910, outputTokens: 123 },
    }),
    STUB_CLAUDE_SAFETY_STOPS: '1',
  });

  const model = 'claude-sonnet-5-5';

  const first = await ctx.session.review(
    model,
    { system: 'the judge policy', user: 'the first evidence' },
    AbortSignal.timeout(10_000),
  );

  const second = await ctx.session.review(
    model,
    { system: 'the judge policy', user: 'the second evidence' },
    AbortSignal.timeout(10_000),
  );

  expect(first).toStrictEqual({
    text: '{"verdict":"confirm","basis":null,"reason":"It posts the token."}',
    model: 'claude-sonnet-5',
    safetyStops: 1,
    fallback: true,
    warm: false,
  });

  expect(second.warm).toBeFalse();
});

test('it reports a fallback from the usage when the result holds no stop count', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It posts the token."}',
    STUB_CLAUDE_REPLY_MODEL: 'claude-sonnet-5',
    STUB_CLAUDE_MODEL_USAGE: JSON.stringify({
      'claude-sonnet-5-5': { inputTokens: 900, outputTokens: 0 },
      'claude-sonnet-5': { inputTokens: 910, outputTokens: 123 },
    }),
  });

  const reply = await ctx.session.review(
    'claude-sonnet-5-5',
    { system: 'the judge policy', user: 'the evidence' },
    AbortSignal.timeout(10_000),
  );

  expect(reply).toStrictEqual({
    text: '{"verdict":"confirm","basis":null,"reason":"It posts the token."}',
    model: 'claude-sonnet-5',
    safetyStops: null,
    fallback: true,
    warm: false,
  });
});

test('it reports the model of the reply when background calls in the process wrote more output', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It posts the token."}',
    STUB_CLAUDE_REPLY_MODEL: 'claude-sonnet-5-5',
    STUB_CLAUDE_MODEL_USAGE: JSON.stringify({
      'claude-sonnet-5-5': { inputTokens: 900, outputTokens: 40 },
      'claude-haiku-5-5': { inputTokens: 4000, outputTokens: 900 },
    }),
  });

  const reply = await ctx.session.review(
    'claude-sonnet-5-5',
    { system: 'the judge policy', user: 'the evidence' },
    AbortSignal.timeout(10_000),
  );

  expect(reply.model).toBe('claude-sonnet-5-5');
});

test('it reports the configured model when the turn printed no assistant message', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It posts the token."}',
    STUB_CLAUDE_MODEL_USAGE: JSON.stringify({
      'claude-haiku-5-5': { inputTokens: 4000, outputTokens: 900 },
    }),
  });

  const reply = await ctx.session.review(
    'claude-sonnet-5-5',
    { system: 'the judge policy', user: 'the evidence' },
    AbortSignal.timeout(10_000),
  );

  expect(reply.model).toBe('claude-sonnet-5-5');
});

test('it appends the raw model usage of each review to the debug file the environment names', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It posts the token."}',
    STUB_CLAUDE_REPLY_MODEL: 'claude-sonnet-5-5',
    STUB_CLAUDE_MODEL_USAGE: JSON.stringify({
      'claude-sonnet-5-5': { inputTokens: 900, outputTokens: 40 },
      'claude-haiku-5-5': { inputTokens: 4000, outputTokens: 900 },
    }),
  });

  await ctx.session.review(
    'claude-sonnet-5-5',
    { system: 'the judge policy', user: 'the evidence' },
    AbortSignal.timeout(10_000),
  );

  const text = await readFile(ctx.debugPath, 'utf8');

  const lines = text
    .trim()
    .split('\n')
    .map((line): unknown => JSON.parse(line));

  expect(lines).toStrictEqual([
    {
      time: expect.toBeDateString(),
      model: 'claude-sonnet-5-5',
      replyModel: 'claude-sonnet-5-5',
      modelUsage: {
        'claude-sonnet-5-5': { inputTokens: 900, outputTokens: 40 },
        'claude-haiku-5-5': { inputTokens: 4000, outputTokens: 900 },
      },
    },
  ]);
});

test('it returns the text of a tagged reply as the judge wrote it', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '<verdict>confirm</verdict>\n<reason>It rewrites main.</reason>',
  });

  const reply = await ctx.session.review(
    'claude-haiku-5-5',
    { system: 'the judge policy', user: 'the evidence' },
    AbortSignal.timeout(10_000),
  );

  expect(reply.text).toBe('<verdict>confirm</verdict>\n<reason>It rewrites main.</reason>');
});

test('it rejects a review whose reply passes the output cap', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It force-pushes."}',
    STUB_CLAUDE_REPLY_BYTES: String(1024 * 1024 + 1),
  });

  await expect(
    ctx.session.review(
      'claude-sonnet-5-5',
      { system: 'the judge policy', user: 'the evidence' },
      AbortSignal.timeout(10_000),
    ),
  ).toReject();
});

test('it rejects a turn that ends in an error', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It force-pushes."}',
    STUB_CLAUDE_IS_ERROR: 'true',
  });

  await expect(
    ctx.session.review(
      'claude-sonnet-5-5',
      { system: 'the judge policy', user: 'the evidence' },
      AbortSignal.timeout(10_000),
    ),
  ).toReject();
});

test('it rejects a review whose process exits, and starts a new process for the next one', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It force-pushes."}',
    STUB_CLAUDE_CRASH: 'true',
  });

  const model = 'claude-sonnet-5-5';

  const first = ctx.session.review(
    model,
    { system: 'the judge policy', user: 'the first evidence' },
    AbortSignal.timeout(10_000),
  );

  await expect(first).toReject();

  const second = ctx.session.review(
    model,
    { system: 'the judge policy', user: 'the second evidence' },
    AbortSignal.timeout(10_000),
  );

  await expect(second).toReject();

  const records = await readStubClaudeRecords(ctx.recordPath);

  expect(new Set(records.map((record) => record.pid)).size).toBe(2);
});

test('it rejects an aborted review with an abort error', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It force-pushes."}',
    STUB_CLAUDE_DELAY_MS: '5000',
  });

  const controller = new AbortController();

  const review = ctx.session.review(
    'claude-sonnet-5-5',
    { system: 'the judge policy', user: 'the evidence' },
    controller.signal,
  );

  controller.abort();

  expect(review).rejects.toMatchObject({ name: 'AbortError' });
});

test('it rejects a queued review at its own deadline while an earlier review still runs', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It force-pushes."}',
    STUB_CLAUDE_DELAY_MS: '1500',
  });

  const first = ctx.session.review(
    'claude-sonnet-5-5',
    { system: 'the judge policy', user: 'the first evidence' },
    AbortSignal.timeout(10_000),
  );

  const startedAt = performance.now();

  const [queued] = await Promise.allSettled([
    ctx.session.review(
      'claude-sonnet-5-5',
      { system: 'the judge policy', user: 'the second evidence' },
      AbortSignal.timeout(100),
    ),
  ]);

  const elapsedMs = performance.now() - startedAt;

  const [earlier] = await Promise.allSettled([first]);

  expect(queued).toMatchObject({ status: 'rejected', reason: { name: 'AbortError' } });
  expect(elapsedMs).toBeLessThan(1000);
  expect(earlier.status).toBe('fulfilled');
});

test('it rejects a review before it starts a process when the signal has already aborted', async () => {
  const ctx = await setupTest({
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"It force-pushes."}',
  });

  expect(
    ctx.session.review(
      'claude-sonnet-5-5',
      { system: 'the judge policy', user: 'the evidence' },
      AbortSignal.abort(),
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
});

test('it rejects a review when no claude is on the PATH', () => {
  const session = startJudgeSession({ PATH: '/nonexistent-auto-mode-bin' });

  expect(
    session.review(
      'claude-sonnet-5-5',
      { system: 'the judge policy', user: 'the evidence' },
      AbortSignal.timeout(10_000),
    ),
  ).rejects.toThrowWithMessage(Error, 'claude is not on the PATH');
});
