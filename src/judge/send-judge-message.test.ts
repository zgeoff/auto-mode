import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { messagesReplies } from '../../mocks/messages-replies.ts';
import { buildMockMessagesResponse } from '../../test-utils/factories/build-mock-messages-response.ts';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import { sendJudgeMessage } from './send-judge-message.ts';
import { startJudgeSession } from './start-judge-session.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-send-judge-message-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const binDir = join(dir, 'bin');

  await mkdir(binDir);

  // the judge finds `claude` through the PATH a test passes, so the stub stands in for it
  await writeFile(
    join(binDir, 'claude'),
    `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, '..', '..', 'test-utils', 'run-stub-claude.ts')}" "$@"\n`,
    { mode: 0o755 },
  );

  return { binDir };
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

test('it returns the Messages reply text for a Messages judge', async () => {
  messagesReplies.push(
    buildMockMessagesResponse({ content: [{ type: 'text', text: 'from messages' }] }),
  );

  const reply = await sendJudgeMessage(
    buildMockProviderConfig({
      protocol: 'messages',
      baseURL: 'https://gateway.test',
      model: 'claude-haiku-5-5',
    }),
    { system: 'the judge policy', user: 'the evidence' },
    { apiKey: 'judge-test-key', env: {} },
    AbortSignal.timeout(10_000),
  );

  expect(reply).toStrictEqual({
    text: 'from messages',
    model: 'claude-haiku-5-5',
    safetyStops: null,
    fallback: false,
    warm: null,
  });
});

test('it refuses a Messages judge without an API key', () => {
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
