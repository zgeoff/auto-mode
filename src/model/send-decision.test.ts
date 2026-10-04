import { expect, test } from 'bun:test';
import { HttpResponse, delay, http } from 'msw';
import { server } from '../../mocks/node.ts';
import { DEFAULT_CONFIG } from '../config/config.ts';
import { sendDecision } from './send-decision.ts';

test('it authenticates a structured decision request and reads typed probabilities', async () => {
  const authorizations: string[] = [];
  let body: unknown;

  server.use(
    http.post('https://decision.test/v1/systemone', async (info) => {
      authorizations.push(info.request.headers.get('authorization') ?? '');

      body = await info.request.json();

      return HttpResponse.json({
        model: 'jev-1.13.0',
        answers: {
          rule: {
            type: 'choice',
            choice: 'allow',
            confidence: 1,
            probabilities: { allow: 1, block: 0, ask: 0 },
          },
        },
        usage: { input_tokens: 100, output_tokens: 10 },
      });
    }),
  );

  const result = await sendDecision(
    { ...DEFAULT_CONFIG.provider, baseURL: 'https://decision.test/' },
    'test-key',
    {
      state: {
        policy: 'policy',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: 'fix the parser',
        action: { tool: 'Edit', cwd: '/repo', input: { new_string: 'green' } },
      },
      questions: {
        rule: {
          type: 'choice',
          instructions: 'Must this action be blocked?',
          criteria: { allow: 'No block', block: 'Block', ask: 'Unknown' },
        },
      },
      rules: {
        rule: {
          name: 'Security Control Removal',
          tier: 'soft',
          source: 'replacement',
          text: 'Do not remove checks',
        },
      },
    },
  );

  expect(authorizations).toStrictEqual(['Bearer test-key']);

  expect(body).toStrictEqual({
    model: 'jev-1.13.0',
    state: {
      policy: 'policy',
      rulesSource: 'replacement',
      configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
      lastUserMessage: 'fix the parser',
      action: { tool: 'Edit', cwd: '/repo', input: { new_string: 'green' } },
    },
    questions: {
      rule: {
        type: 'choice',
        instructions: 'Must this action be blocked?',
        criteria: { allow: 'No block', block: 'Block', ask: 'Unknown' },
      },
    },
  });

  expect(result).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
    inputTokens: 100,
  });
});

test.each([
  ['empty answer set', {}],
  [
    'unknown choice',
    {
      rule: {
        type: 'choice',
        choice: 'ignore',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
  ],
  [
    'invalid sum',
    {
      rule: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 0.6, block: 0.6, ask: 0 },
      },
    },
  ],
  [
    'wrong winner',
    {
      rule: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 0.1, block: 0.9, ask: 0 },
      },
    },
  ],
  [
    'invalid confidence',
    {
      rule: {
        type: 'choice',
        choice: 'allow',
        confidence: 2,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
  ],
  [
    'missing probability',
    { rule: { type: 'choice', choice: 'allow', confidence: 1, probabilities: { allow: 1 } } },
  ],
  [
    'extra answer',
    {
      rule: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
      extra: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
  ],
] as const)('it rejects %s rather than turning it into an allow', async (_label, answers) => {
  server.use(
    http.post('https://decision.test/v1/systemone', () =>
      HttpResponse.json({ model: 'jev-1.13.0', answers, usage: { input_tokens: 100 } }),
    ),
  );

  const response = sendDecision(
    { ...DEFAULT_CONFIG.provider, baseURL: 'https://decision.test' },
    'test-key',
    {
      state: {
        policy: 'policy',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Edit', cwd: '/repo', input: {} },
      },
      questions: {
        rule: {
          type: 'choice',
          instructions: 'Must this action be blocked?',
          criteria: { allow: 'No block', block: 'Block', ask: 'Unknown' },
        },
      },
      rules: {
        rule: {
          name: 'Security Control Removal',
          tier: 'soft',
          source: 'replacement',
          text: 'Do not remove checks',
        },
      },
    },
  );

  await expect(response).toReject();
});

test('it aborts a request at its deadline', () => {
  server.use(
    http.post('https://decision.test/v1/systemone', async () => {
      await delay(100);

      return HttpResponse.json({});
    }),
  );

  const response = sendDecision(
    { ...DEFAULT_CONFIG.provider, baseURL: 'https://decision.test', timeoutMs: 10 },
    'test-key',
    {
      state: {
        policy: 'policy',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Edit', cwd: '/repo', input: {} },
      },
      questions: {},
      rules: {},
    },
  );

  expect(response).rejects.toHaveProperty('name', 'AbortError');
});

test('it refuses oversized input before a request without truncating it', async () => {
  const response = sendDecision(
    { ...DEFAULT_CONFIG.provider, baseURL: 'https://decision.test' },
    'test-key',
    {
      state: {
        policy: 'policy',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: {
          tool: 'Write',
          cwd: '/repo',
          input: { content: `${'x'.repeat(100_001)} remove the auth check` },
        },
      },
      questions: {},
      rules: {},
    },
  );

  await expect(response).toReject();
});

test('it omits response bodies from HTTP errors', () => {
  server.use(
    http.post('https://decision.test/v1/systemone', () =>
      HttpResponse.text('private request content', { status: 401 }),
    ),
  );

  const response = sendDecision(
    { ...DEFAULT_CONFIG.provider, baseURL: 'https://decision.test' },
    'test-key',
    {
      state: {
        policy: 'policy',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Edit', cwd: '/repo', input: {} },
      },
      questions: {},
      rules: {},
    },
  );

  expect(response).rejects.toThrow('Decision API returned HTTP 401');
});

test('it discards malformed JSON bodies instead of exposing credential fragments', () => {
  server.use(
    http.post('https://decision.test/v1/systemone', () =>
      HttpResponse.text('test-secret-prefix {'),
    ),
  );

  const response = sendDecision(
    { ...DEFAULT_CONFIG.provider, baseURL: 'https://decision.test' },
    'test-secret-prefix-and-tail',
    {
      state: {
        policy: 'policy',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Edit', cwd: '/repo', input: {} },
      },
      questions: {},
      rules: {},
    },
  );

  expect(response).rejects.toThrow('Decision API returned invalid JSON');
});
