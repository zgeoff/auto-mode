import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpResponse, delay, http } from 'msw';
import invariant from 'tiny-invariant';
import { server } from '../../mocks/node.ts';
import type { Config } from '../config/config.ts';
import type { ActionRequest } from '../request/types.ts';
import { classifyWithModel } from './classify-with-model.ts';

const KEY_ENV = 'AUTO_MODE_CLASSIFY_KEY';
const ENDPOINT = 'https://gateway.test/v1/messages';

const CONFIG: Config = {
  provider: {
    baseURL: 'https://gateway.test',
    model: 'test-model',
    apiKeyEnv: KEY_ENV,
    reasoning: true,
    maxTokens: 3000,
    timeoutMs: 5000,
  },
  onFailure: 'defer',
};

const PAYLOAD: ActionRequest = {
  sessionID: 's-1',
  cwd: '/repo',
  toolName: 'Bash',
  toolInput: { command: 'git push --force origin main' },
};

async function setupTest(): Promise<{ readonly dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-model-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads an allow out of the model answer', async () => {
  const ctx = await setupTest();

  server.use(
    http.post(ENDPOINT, () =>
      HttpResponse.json({ content: [{ type: 'text', text: '<block>no</block>' }] }),
    ),
  );

  const outcome = await classifyWithModel({ ...PAYLOAD, cwd: ctx.dir }, CONFIG, {
    host: { env: { [KEY_ENV]: 'test-key' }, home: ctx.dir },
  });

  expect(outcome.verdict).toStrictEqual({ kind: 'allow' });
});

test('it reads a deny with its rule and reason out of the model answer', async () => {
  const ctx = await setupTest();

  server.use(
    http.post(ENDPOINT, () =>
      HttpResponse.json({
        content: [
          {
            type: 'text',
            text: '<block>yes</block><rule>History Rewrite</rule><reason>Force push to main.</reason>',
          },
        ],
      }),
    ),
  );

  const outcome = await classifyWithModel({ ...PAYLOAD, cwd: ctx.dir }, CONFIG, {
    host: { env: { [KEY_ENV]: 'test-key' }, home: ctx.dir },
  });

  expect(outcome.verdict).toStrictEqual({
    kind: 'deny',
    rule: 'History Rewrite',
    reason: 'Force push to main.',
  });
});

test('it reports the cache counts alongside the verdict', async () => {
  const ctx = await setupTest();

  server.use(
    http.post(ENDPOINT, () =>
      HttpResponse.json({
        content: [{ type: 'text', text: '<block>no</block>' }],
        usage: {
          cache_read_input_tokens: 7025,
          cache_creation_input_tokens: 0,
          input_tokens: 42,
          output_tokens: 130,
        },
      }),
    ),
  );

  const outcome = await classifyWithModel({ ...PAYLOAD, cwd: ctx.dir }, CONFIG, {
    host: { env: { [KEY_ENV]: 'test-key' }, home: ctx.dir },
  });

  expect(outcome.note).toInclude('7025 cached / 0 written / 42 new / 130 out');
});

// Writing nothing keeps the prompt Claude Code was about to show.
test('it has no opinion when no API key is configured', async () => {
  const ctx = await setupTest();

  const outcome = await classifyWithModel({ ...PAYLOAD, cwd: ctx.dir }, CONFIG, {
    host: { env: {}, home: ctx.dir },
  });

  expect(outcome.verdict).toBeNull();
  expect(outcome.note).toInclude('no API key');
});

test('it has no opinion when the model call fails', async () => {
  const ctx = await setupTest();

  server.use(http.post(ENDPOINT, () => HttpResponse.text('boom', { status: 500 })));

  const outcome = await classifyWithModel({ ...PAYLOAD, cwd: ctx.dir }, CONFIG, {
    host: { env: { [KEY_ENV]: 'test-key' }, home: ctx.dir },
  });

  expect(outcome.verdict).toBeNull();
  expect(outcome.note).toInclude('no verdict');
});

test('it names the timeout when the model call outlives it', async () => {
  const ctx = await setupTest();

  const timer = new AbortController();

  const timeout = mock<(ms: number) => AbortSignal>(() => timer.signal);

  server.use(
    http.post(ENDPOINT, async () => {
      timer.abort();

      await delay('infinite');

      return HttpResponse.json({ content: [] });
    }),
  );

  const outcome = await classifyWithModel(
    { ...PAYLOAD, cwd: ctx.dir },
    { ...CONFIG, provider: { ...CONFIG.provider, timeoutMs: 20 } },
    { host: { env: { [KEY_ENV]: 'test-key' }, home: ctx.dir }, timeout },
  );

  expect(timeout).toHaveBeenCalledExactlyOnceWith(20);
  expect(outcome.note).toInclude('timed out after 20ms');
});

// The handler never answers, so only the real timer can end the model call.
test('it times out on the model call deadline with the real timer', async () => {
  const ctx = await setupTest();

  server.use(
    http.post(ENDPOINT, async () => {
      await delay('infinite');

      return HttpResponse.json({ content: [] });
    }),
  );

  const outcome = await classifyWithModel(
    { ...PAYLOAD, cwd: ctx.dir },
    { ...CONFIG, provider: { ...CONFIG.provider, timeoutMs: 1 } },
    { host: { env: { [KEY_ENV]: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome.note).toInclude('timed out after 1ms');
});

test('it starts the model call timer at the next whole millisecond for a fractional timeout', async () => {
  const ctx = await setupTest();

  const timer = new AbortController();

  const timeout = mock<(ms: number) => AbortSignal>(() => timer.signal);

  server.use(
    http.post(ENDPOINT, async () => {
      timer.abort();

      await delay('infinite');

      return HttpResponse.json({ content: [] });
    }),
  );

  const outcome = await classifyWithModel(
    { ...PAYLOAD, cwd: ctx.dir },
    { ...CONFIG, provider: { ...CONFIG.provider, timeoutMs: 1000.5 } },
    { host: { env: { [KEY_ENV]: 'test-key' }, home: ctx.dir }, timeout },
  );

  expect(timeout).toHaveBeenCalledExactlyOnceWith(1001);
  expect(outcome.note).toInclude('timed out after 1000.5ms');
});

// Spark returns nothing at all when maxTokens is too low for it to finish
// reasoning, and an empty answer is not an allow.
test('it treats an empty answer as a failure rather than an allow', async () => {
  const ctx = await setupTest();

  server.use(http.post(ENDPOINT, () => HttpResponse.json({ content: [] })));

  const outcome = await classifyWithModel({ ...PAYLOAD, cwd: ctx.dir }, CONFIG, {
    host: { env: { [KEY_ENV]: 'test-key' }, home: ctx.dir },
  });

  expect(outcome.verdict).toBeNull();
  expect(outcome.note).toInclude('raise maxTokens');
});

test('it denies rather than deferring when configured to fail closed', async () => {
  const ctx = await setupTest();

  server.use(http.post(ENDPOINT, () => HttpResponse.text('boom', { status: 500 })));

  const outcome = await classifyWithModel(
    { ...PAYLOAD, cwd: ctx.dir },
    { ...CONFIG, onFailure: 'deny' },
    { host: { env: { [KEY_ENV]: 'test-key' }, home: ctx.dir } },
  );

  invariant(outcome.verdict?.kind === 'deny', 'failing closed produces a denial');

  expect(outcome.verdict.rule).toBe('Classifier Unavailable');
  expect(outcome.verdict.reason).toInclude('fail closed');
});

test('it has no opinion when the policy file cannot be read', async () => {
  const ctx = await setupTest();

  const outcome = await classifyWithModel(
    { ...PAYLOAD, cwd: ctx.dir },
    {
      ...CONFIG,
      classifierPath: join(ctx.dir, 'missing', 'classifier.md'),
      rulesPath: join(ctx.dir, 'missing', 'rules.md'),
    },
    { host: { env: { [KEY_ENV]: 'test-key' }, home: ctx.dir } },
  );

  expect(outcome.verdict).toBeNull();
  expect(outcome.note).toInclude('policy unreadable');
});

test('it runs no key command and sends no request once the evaluation is cancelled', async () => {
  const ctx = await setupTest();

  let requests = 0;

  server.use(
    http.post(ENDPOINT, () => {
      requests += 1;

      return HttpResponse.json({ content: [{ type: 'text', text: '<block>no</block>' }] });
    }),
  );

  const controller = new AbortController();

  controller.abort();

  const outcome = await classifyWithModel(
    { ...PAYLOAD, cwd: ctx.dir },
    {
      ...CONFIG,
      provider: { ...CONFIG.provider, apiKeyEnv: undefined, apiKeyCommand: 'printf from-command' },
    },
    { signal: controller.signal, host: { env: {}, home: ctx.dir } },
  );

  expect(outcome.verdict).toBeNull();
  expect(outcome.note).toInclude('no API key');
  expect(requests).toBe(0);
});
