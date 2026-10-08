import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpResponse, delay, http } from 'msw';
import { MESSAGES_URL } from '../../mocks/handlers.ts';
import { messagesReplies } from '../../mocks/messages-replies.ts';
import { server } from '../../mocks/node.ts';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildMockConfig } from '../../test-utils/factories/build-mock-config.ts';
import { classifyWithModel } from './classify-with-model.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-model-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it hands a decision service provider to Jev', async () => {
  const ctx = await setupTest();

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'system-one',
        model: 'jev-1.13.0',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
      },
      onFailure: 'defer',
    }),
    { host: { env: { AUTO_MODE_CLASSIFY_KEY: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    note: expect.toBeString(),
    diagnostics: {
      status: 'allow',
      stage: 'response',
      keyResolved: true,
      keySource: 'environment',
      failureReason: null,
      requestBytes: expect.toBePositive(),
      elapsedMs: expect.toBeWithin(0, Infinity),
      minConfidence: 0.8,
      contributors: [],
    },
  });

  expect(outcome.note).toMatch(/^jev-1\.13\.0: allow \(\d+ms, 400 input tokens\)$/u);
});

test('it reads an allow out of the model answer', async () => {
  const ctx = await setupTest();

  messagesReplies.push({
    content: [{ type: 'text', text: '<block>no</block>' }],
    usage: {
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
    },
  });

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        model: 'test-model',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
      },
      onFailure: 'defer',
    }),
    { host: { env: { AUTO_MODE_CLASSIFY_KEY: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    note: 'test-model allowed it (0 cached / 0 written / 0 new / 0 out)',
  });
});

test('it reads a deny with its rule and reason out of the model answer', async () => {
  const ctx = await setupTest();

  messagesReplies.push({
    content: [
      {
        type: 'text',
        text: '<block>yes</block><rule>History Rewrite</rule><reason>Force push to main.</reason>',
      },
    ],
    usage: {
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
    },
  });

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        model: 'test-model',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
      },
      onFailure: 'defer',
    }),
    { host: { env: { AUTO_MODE_CLASSIFY_KEY: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'deny', rule: 'History Rewrite', reason: 'Force push to main.' },
    note: 'test-model blocked it: [History Rewrite] Force push to main. (0 cached / 0 written / 0 new / 0 out)',
  });
});

test('it reports the cache counts alongside the verdict', async () => {
  const ctx = await setupTest();

  messagesReplies.push({
    content: [{ type: 'text', text: '<block>no</block>' }],
    usage: {
      cache_read_input_tokens: 7025,
      cache_creation_input_tokens: 0,
      input_tokens: 42,
      output_tokens: 130,
    },
  });

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        model: 'test-model',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
      },
      onFailure: 'defer',
    }),
    { host: { env: { AUTO_MODE_CLASSIFY_KEY: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: { kind: 'allow' },
    note: 'test-model allowed it (7025 cached / 0 written / 42 new / 130 out)',
  });
});

// Writing nothing keeps the prompt Claude Code was about to show.
test('it has no opinion when no API key is configured', async () => {
  const ctx = await setupTest();

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
      },
      onFailure: 'defer',
    }),
    { host: { env: {}, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    note: 'no API key: set the configured environment variable or key command; no verdict',
  });
});

test('it has no opinion when the model call fails', async () => {
  const ctx = await setupTest();

  server.use(http.post(MESSAGES_URL, () => HttpResponse.text('boom', { status: 500 })));

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        model: 'test-model',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
      },
      onFailure: 'defer',
    }),
    { host: { env: { AUTO_MODE_CLASSIFY_KEY: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    note: 'test-model failed: Messages API returned HTTP 500; no verdict',
  });
});

test('it names the timeout when the model call outlives it', async () => {
  const ctx = await setupTest();

  const timer = new AbortController();

  const timeout = mock<(ms: number) => AbortSignal>(() => timer.signal);

  server.use(
    http.post(MESSAGES_URL, async () => {
      timer.abort();

      await delay('infinite');

      return HttpResponse.json({ content: [] });
    }),
  );

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        model: 'test-model',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
        timeoutMs: 20,
      },
      onFailure: 'defer',
    }),
    { host: { env: { AUTO_MODE_CLASSIFY_KEY: 'test-key' }, home: ctx.dir }, timeout },
  );

  expect(timeout).toHaveBeenCalledExactlyOnceWith(20);

  expect(outcome).toStrictEqual({
    verdict: null,
    note: 'test-model failed: timed out after 20ms; no verdict',
  });
});

// The handler never answers, so only the real timer can end the model call.
test('it times out on the model call deadline with the real timer', async () => {
  const ctx = await setupTest();

  server.use(
    http.post(MESSAGES_URL, async () => {
      await delay('infinite');

      return HttpResponse.json({ content: [] });
    }),
  );

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        model: 'test-model',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
        timeoutMs: 1,
      },
      onFailure: 'defer',
    }),
    { host: { env: { AUTO_MODE_CLASSIFY_KEY: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    note: 'test-model failed: timed out after 1ms; no verdict',
  });
});

test('it starts the model call timer at the next whole millisecond for a fractional timeout', async () => {
  const ctx = await setupTest();

  const timer = new AbortController();

  const timeout = mock<(ms: number) => AbortSignal>(() => timer.signal);

  server.use(
    http.post(MESSAGES_URL, async () => {
      timer.abort();

      await delay('infinite');

      return HttpResponse.json({ content: [] });
    }),
  );

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        model: 'test-model',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
        timeoutMs: 1000.5,
      },
      onFailure: 'defer',
    }),
    { host: { env: { AUTO_MODE_CLASSIFY_KEY: 'test-key' }, home: ctx.dir }, timeout },
  );

  expect(timeout).toHaveBeenCalledExactlyOnceWith(1001);

  expect(outcome).toStrictEqual({
    verdict: null,
    note: 'test-model failed: timed out after 1000.5ms; no verdict',
  });
});

// Spark returns nothing at all when maxTokens is too low for it to finish
// reasoning, and an empty answer is not an allow.
test('it treats an empty answer as a failure rather than an allow', async () => {
  const ctx = await setupTest();

  messagesReplies.push({
    content: [],
    usage: {
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
    },
  });

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        model: 'test-model',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
      },
      onFailure: 'defer',
    }),
    { host: { env: { AUTO_MODE_CLASSIFY_KEY: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: null,
    note: 'test-model returned no text; raise maxTokens; no verdict',
  });
});

test('it denies rather than deferring when configured to fail closed', async () => {
  const ctx = await setupTest();

  server.use(http.post(MESSAGES_URL, () => HttpResponse.text('boom', { status: 500 })));

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        model: 'test-model',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
      },
      onFailure: 'deny',
    }),
    { host: { env: { AUTO_MODE_CLASSIFY_KEY: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome).toStrictEqual({
    verdict: {
      kind: 'deny',
      rule: 'Classifier Unavailable',
      reason:
        'test-model failed: Messages API returned HTTP 500; this policy is configured to fail closed.',
    },
    note: 'test-model failed: Messages API returned HTTP 500',
  });
});

test('it has no opinion when the policy file cannot be read', async () => {
  const ctx = await setupTest();

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        apiKeyEnv: 'AUTO_MODE_CLASSIFY_KEY',
      },
      classifierPath: join(ctx.dir, 'missing', 'classifier.md'),
      onFailure: 'defer',
    }),
    { host: { env: { AUTO_MODE_CLASSIFY_KEY: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome.verdict).toBeNull();
  expect(outcome.note).toMatch(/^policy unreadable: ENOENT: .+; no verdict$/u);
});

test('it runs no key command and sends no request once the evaluation is cancelled', async () => {
  const ctx = await setupTest();

  const requested = mock();

  server.use(
    http.post(MESSAGES_URL, () => {
      requested();
    }),
  );

  const controller = new AbortController();

  controller.abort();

  const outcome = await classifyWithModel(
    buildMockActionRequest({
      cwd: ctx.dir,
      toolName: 'Bash',
      toolInput: { command: 'git push --force origin main' },
    }),
    buildMockConfig({
      provider: {
        protocol: 'messages',
        baseURL: 'https://gateway.test',
        apiKeyEnv: undefined,
        apiKeyCommand: 'printf from-command',
      },
      onFailure: 'defer',
    }),
    { signal: controller.signal, host: { env: {}, home: ctx.dir } },
  );

  expect(requested).not.toHaveBeenCalled();

  expect(outcome).toStrictEqual({
    verdict: null,
    note: 'no API key: set the configured environment variable or key command; no verdict',
  });
});
