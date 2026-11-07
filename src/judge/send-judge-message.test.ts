import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubClaude } from '../../test-utils/create-stub-claude.ts';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import { readStubClaudeRecords } from '../../test-utils/read-stub-claude-records.ts';
import { sendJudgeMessage } from './send-judge-message.ts';
import { startJudgeSession } from './start-judge-session.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-send-judge-message-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = await createStubClaude(directory);

  return { binDir, recordPath: join(directory, 'calls.jsonl') };
}

test('it returns the claude run’s text and answering model for a claude-code judge, with no API key', async () => {
  const ctx = await setupTest();

  const reply = await sendJudgeMessage(
    buildMockProviderConfig({ protocol: 'claude-code', model: 'claude-sonnet-5-5' }),
    { system: 'the judge policy', user: 'the evidence' },
    {
      apiKey: null,
      env: {
        PATH: ctx.binDir,
        STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"From claude."}',
        STUB_CLAUDE_ASSISTANT_MESSAGES: JSON.stringify([{ model: 'claude-sonnet-5' }]),
        STUB_CLAUDE_MODEL_USAGE: JSON.stringify({
          'claude-sonnet-5-5': { outputTokens: 0 },
          'claude-sonnet-5': { outputTokens: 31 },
        }),
        STUB_CLAUDE_SAFETY_STOPS: '1',
      },
    },
    AbortSignal.timeout(10_000),
  );

  expect(reply).toStrictEqual({
    text: '{"verdict":"confirm","basis":null,"reason":"From claude."}',
    model: 'claude-sonnet-5',
    safetyStops: 1,
    fallback: true,
    warm: false,
    modelUsage: {
      'claude-sonnet-5-5': { outputTokens: 0 },
      'claude-sonnet-5': { outputTokens: 31 },
    },
  });
});

test('it sends a claude-code review through the session the caller holds, whose process stays warm', async () => {
  const ctx = await setupTest();

  const env = {
    PATH: ctx.binDir,
    STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"From claude."}',
  };

  const session = startJudgeSession(env);

  onTestFinished(() => {
    session.stop();
  });

  const provider = buildMockProviderConfig({ protocol: 'claude-code', model: 'claude-sonnet-5-5' });

  await sendJudgeMessage(
    provider,
    { system: 'the judge policy', user: 'the first evidence' },
    { apiKey: null, env, session },
    AbortSignal.timeout(10_000),
  );

  const second = await sendJudgeMessage(
    provider,
    { system: 'the judge policy', user: 'the second evidence' },
    { apiKey: null, env, session },
    AbortSignal.timeout(10_000),
  );

  expect(second.warm).toBeTrue();
});

test('it reviews a Messages API judge through claude on the judge’s API, with its key and output budget', async () => {
  const ctx = await setupTest();

  const reply = await sendJudgeMessage(
    buildMockProviderConfig({
      protocol: 'messages',
      baseURL: 'https://provider.example/anthropic',
      model: 'provider-model-2',
      maxTokens: 2500,
    }),
    { system: 'the judge policy', user: 'the evidence' },
    {
      apiKey: 'judge-test-key',
      env: {
        PATH: ctx.binDir,
        STUB_CLAUDE_RECORD: ctx.recordPath,
        STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"From the provider."}',
      },
    },
    AbortSignal.timeout(10_000),
  );

  const records = await readStubClaudeRecords(ctx.recordPath);

  expect(reply).toStrictEqual({
    text: '{"verdict":"confirm","basis":null,"reason":"From the provider."}',
    model: 'provider-model-2',
    safetyStops: null,
    fallback: false,
    warm: false,
    modelUsage: {},
  });

  expect(records.map((record) => record.env)).toStrictEqual([
    {
      ANTHROPIC_API_KEY: 'judge-test-key',
      ANTHROPIC_BASE_URL: 'https://provider.example/anthropic',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'provider-model-2',
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: '2500',
    },
  ]);
});

test('it rounds a fractional output budget up to a whole token count', async () => {
  const ctx = await setupTest();

  await sendJudgeMessage(
    buildMockProviderConfig({
      protocol: 'messages',
      baseURL: 'https://provider.example/anthropic',
      model: 'provider-model-2',
      maxTokens: 2500.5,
    }),
    { system: 'the judge policy', user: 'the evidence' },
    {
      apiKey: 'judge-test-key',
      env: {
        PATH: ctx.binDir,
        STUB_CLAUDE_RECORD: ctx.recordPath,
        STUB_CLAUDE_REPLY: '{"verdict":"confirm","basis":null,"reason":"From the provider."}',
      },
    },
    AbortSignal.timeout(10_000),
  );

  const records = await readStubClaudeRecords(ctx.recordPath);

  expect(records.map((record) => record.env['CLAUDE_CODE_MAX_OUTPUT_TOKENS'])).toStrictEqual([
    '2501',
  ]);
});

test('it refuses a Messages API judge without an API key', () => {
  expect(
    sendJudgeMessage(
      buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test' }),
      { system: 'the judge policy', user: 'the evidence' },
      { apiKey: null, env: {} },
      AbortSignal.timeout(10_000),
    ),
  ).rejects.toThrowWithMessage(Error, 'no API key for the judge');
});

test('it refuses a Jev judge, which returns typed answers and no reason', () => {
  expect(
    sendJudgeMessage(
      buildMockProviderConfig({ protocol: 'system-one' }),
      { system: 'the judge policy', user: 'the evidence' },
      { apiKey: 'judge-test-key', env: {} },
      AbortSignal.timeout(10_000),
    ),
  ).rejects.toThrowWithMessage(Error, 'Jev returns typed answers and cannot write a judge reason');
});
