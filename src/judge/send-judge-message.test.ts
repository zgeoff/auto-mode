import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { messagesReplies } from '../../mocks/messages-replies.ts';
import { buildMockMessagesResponse } from '../../test-utils/factories/build-mock-messages-response.ts';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import { sendJudgeMessage } from './send-judge-message.ts';

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

test('it returns the claude run’s text for a claude-code judge, with no API key', async () => {
  const ctx = await setupTest();

  const text = await sendJudgeMessage(
    buildMockProviderConfig({ protocol: 'claude-code' }),
    { system: 'the judge policy', user: 'the evidence' },
    { apiKey: null, env: { PATH: ctx.binDir, STUB_CLAUDE_REPLY: 'from claude' } },
    AbortSignal.timeout(10_000),
  );

  expect(text).toBe('from claude');
});

test('it returns the Messages reply text for a Messages judge', async () => {
  messagesReplies.push(
    buildMockMessagesResponse({ content: [{ type: 'text', text: 'from messages' }] }),
  );

  const text = await sendJudgeMessage(
    buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test' }),
    { system: 'the judge policy', user: 'the evidence' },
    { apiKey: 'judge-test-key', env: {} },
    AbortSignal.timeout(10_000),
  );

  expect(text).toBe('from messages');
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
