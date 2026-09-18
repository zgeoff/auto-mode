import { expect, onTestFinished, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import invariant from 'tiny-invariant';
import { server } from '../../mocks/node.ts';
import type { Config } from '../config/config.ts';
import type { HookPayload } from '../harness/types.ts';
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
  transcriptEntries: 40,
  onFailure: 'defer',
};

const PAYLOAD: HookPayload = {
  harness: 'claude',
  event: 'PreToolUse',
  sessionId: 's-1',
  cwd: '/repo',
  toolName: 'Bash',
  toolInput: { command: 'git push --force origin main' },
  raw: {},
};

function setupTest(): void {
  process.env[KEY_ENV] = 'test-key';

  onTestFinished(() => {
    delete process.env[KEY_ENV];
  });
}

test('it reads an allow out of the model answer', async () => {
  setupTest();

  server.use(
    http.post(ENDPOINT, () =>
      HttpResponse.json({ content: [{ type: 'text', text: '<block>no</block>' }] }),
    ),
  );

  const outcome = await classifyWithModel(PAYLOAD, CONFIG);

  expect(outcome.verdict).toStrictEqual({ kind: 'allow' });
});

test('it reads a deny with its rule and reason out of the model answer', async () => {
  setupTest();

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

  const outcome = await classifyWithModel(PAYLOAD, CONFIG);

  expect(outcome.verdict).toStrictEqual({
    kind: 'deny',
    rule: 'History Rewrite',
    reason: 'Force push to main.',
  });
});

test('it reports the cache counts alongside the verdict', async () => {
  setupTest();

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

  const outcome = await classifyWithModel(PAYLOAD, CONFIG);

  expect(outcome.note).toInclude('7025 cached / 0 written / 42 new / 130 out');
});

// Writing nothing lets the harness do what it would have done alone.
test('it has no opinion when no API key is configured', async () => {
  const outcome = await classifyWithModel(PAYLOAD, CONFIG);

  expect(outcome.verdict).toBeNull();
  expect(outcome.note).toInclude('no API key');
});

test('it has no opinion when the model call fails', async () => {
  setupTest();

  server.use(http.post(ENDPOINT, () => HttpResponse.text('boom', { status: 500 })));

  const outcome = await classifyWithModel(PAYLOAD, CONFIG);

  expect(outcome.verdict).toBeNull();
  expect(outcome.note).toInclude('deferring to the harness');
});

test('it names the timeout when the model call outlives it', async () => {
  setupTest();

  server.use(
    http.post(ENDPOINT, async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });

      return HttpResponse.json({ content: [] });
    }),
  );

  const outcome = await classifyWithModel(PAYLOAD, {
    ...CONFIG,
    provider: { ...CONFIG.provider, timeoutMs: 20 },
  });

  expect(outcome.note).toInclude('timed out after 20ms');
});

// Spark returns nothing at all when maxTokens is too low for it to finish
// reasoning, and an empty answer is not an allow.
test('it treats an empty answer as a failure rather than an allow', async () => {
  setupTest();

  server.use(http.post(ENDPOINT, () => HttpResponse.json({ content: [] })));

  const outcome = await classifyWithModel(PAYLOAD, CONFIG);

  expect(outcome.verdict).toBeNull();
  expect(outcome.note).toInclude('raise maxTokens');
});

test('it denies rather than deferring when configured to fail closed', async () => {
  setupTest();

  server.use(http.post(ENDPOINT, () => HttpResponse.text('boom', { status: 500 })));

  const outcome = await classifyWithModel(PAYLOAD, { ...CONFIG, onFailure: 'deny' });

  invariant(outcome.verdict?.kind === 'deny', 'failing closed produces a denial');

  expect(outcome.verdict.rule).toBe('Classifier Unavailable');
  expect(outcome.verdict.reason).toInclude('fail closed');
});

test('it has no opinion when the policy file cannot be read', async () => {
  setupTest();

  const outcome = await classifyWithModel(PAYLOAD, {
    ...CONFIG,
    classifierPath: '/nowhere/classifier.md',
    rulesPath: '/nowhere/rules.md',
  });

  expect(outcome.verdict).toBeNull();
  expect(outcome.note).toInclude('policy unreadable');
});
