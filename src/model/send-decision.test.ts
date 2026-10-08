import { expect, test } from 'bun:test';
import { HttpResponse, delay, http } from 'msw';
import invariant from 'tiny-invariant';
import { server } from '../../mocks/node.ts';
import { DEFAULT_CONFIG } from '../config/config.ts';
import { DecisionRequestError } from './decision-request-error.ts';
import { sendDecision } from './send-decision.ts';

test('it authenticates a structured decision request and reads typed probabilities', async () => {
  const authorizations: string[] = [];
  let body: unknown;
  let bodyBytes = 0;

  server.use(
    http.post('https://decision.test/v1/systemone', async (info) => {
      authorizations.push(info.request.headers.get('authorization') ?? '');

      const text = await info.request.text();

      bodyBytes = Buffer.byteLength(text);
      body = JSON.parse(text);

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
        answerGuidance: 'Apply the policy.',
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
    new AbortController().signal,
  );

  expect(authorizations).toStrictEqual(['Bearer test-key']);

  expect(body).toStrictEqual({
    model: 'jev-1.13.0',
    state: {
      policy: 'policy',
      answerGuidance: 'Apply the policy.',
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
    requestBytes: bodyBytes,
  });
});

test.each([
  [
    '0.99',
    {
      type: 'choice',
      choice: 'allow',
      confidence: 0.72,
      probabilities: { block: 0.1, ask: 0.08, allow: 0.81 },
    },
  ],
  [
    '1.01',
    {
      type: 'choice',
      choice: 'allow',
      confidence: 0.81,
      probabilities: { allow: 0.81, block: 0.1, ask: 0.1 },
    },
  ],
] as const)('it accepts two-decimal probabilities that sum to %s', async (_sum, answer) => {
  server.use(
    http.post('https://decision.test/v1/systemone', () =>
      HttpResponse.json({
        model: 'jev-1.13.0',
        answers: { rule: answer },
        usage: { input_tokens: 100 },
      }),
    ),
  );

  const result = await sendDecision(
    { ...DEFAULT_CONFIG.provider, baseURL: 'https://decision.test' },
    'test-key',
    {
      state: {
        policy: 'policy',
        answerGuidance: 'Apply the policy.',
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
    new AbortController().signal,
  );

  expect(result.answers).toStrictEqual({ rule: answer });
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
    'a sum of 0.98',
    {
      rule: {
        type: 'choice',
        choice: 'allow',
        confidence: 0.8,
        probabilities: { allow: 0.8, block: 0.1, ask: 0.08 },
      },
    },
  ],
  [
    'a sum of 1.02',
    {
      rule: {
        type: 'choice',
        choice: 'allow',
        confidence: 0.82,
        probabilities: { allow: 0.82, block: 0.1, ask: 0.1 },
      },
    },
  ],
  [
    'a boundary sum with the wrong winner',
    {
      rule: {
        type: 'choice',
        choice: 'block',
        confidence: 0.1,
        probabilities: { allow: 0.81, block: 0.1, ask: 0.08 },
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
        answerGuidance: 'Apply the policy.',
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
    new AbortController().signal,
  );

  const rejection: unknown = await response.catch((error: unknown) => error);

  expect(rejection).toBeInstanceOf(DecisionRequestError);
  expect(rejection).toMatchObject({ reason: 'invalid-response' });
});

test('it aborts a request when its signal fires and reports the request size', async () => {
  const timer = new AbortController();

  server.use(
    http.post('https://decision.test/v1/systemone', async () => {
      timer.abort();

      await delay('infinite');

      return HttpResponse.json({});
    }),
  );

  const response = sendDecision(
    { ...DEFAULT_CONFIG.provider, baseURL: 'https://decision.test' },
    'test-key',
    {
      state: {
        policy: 'policy',
        answerGuidance: 'Apply the policy.',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Edit', cwd: '/repo', input: {} },
      },
      questions: {},
      rules: {},
    },
    timer.signal,
  );

  const rejection: unknown = await response.catch((error: unknown) => error);

  invariant(rejection instanceof DecisionRequestError, 'the deadline rejects with its reason');

  expect(rejection.reason).toBe('aborted');
  expect(rejection.requestBytes).toBeGreaterThan(0);
  expect(rejection.cause).toHaveProperty('name', 'AbortError');
});

test('it refuses oversized input before a request without truncating it', async () => {
  const response = sendDecision(
    { ...DEFAULT_CONFIG.provider, baseURL: 'https://decision.test' },
    'test-key',
    {
      state: {
        policy: 'policy',
        answerGuidance: 'Apply the policy.',
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
    new AbortController().signal,
  );

  const rejection: unknown = await response.catch((error: unknown) => error);

  invariant(rejection instanceof DecisionRequestError, 'the size guard rejects with its reason');

  expect(rejection.reason).toBe('request-too-large');
  expect(rejection.message).not.toInclude('remove the auth check');
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
        answerGuidance: 'Apply the policy.',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Edit', cwd: '/repo', input: {} },
      },
      questions: {},
      rules: {},
    },
    new AbortController().signal,
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
        answerGuidance: 'Apply the policy.',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Edit', cwd: '/repo', input: {} },
      },
      questions: {},
      rules: {},
    },
    new AbortController().signal,
  );

  expect(response).rejects.toThrow('Decision API returned invalid JSON');
});

test('it removes optional tasks to preserve a complete action near the request limit', async () => {
  let body: unknown;

  server.use(
    http.post('https://decision.test/v1/systemone', async (info) => {
      body = await info.request.json();

      return HttpResponse.json({ model: 'jev-1.13.0', answers: {}, usage: { input_tokens: 400 } });
    }),
  );

  const content = 'x'.repeat(99_000);

  await sendDecision(
    { ...DEFAULT_CONFIG.provider, baseURL: 'https://decision.test' },
    'test-key',
    {
      state: {
        policy: 'complete policy',
        answerGuidance: 'Apply the policy.',
        rulesSource: 'replacement',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: 'Do not push',
        action: { tool: 'Write', cwd: '/repo', input: { content } },
        taskContext: {
          agentID: null,
          originalUserTask: { text: 't'.repeat(3000), origin: 'composer' },
          delegatedTask: { text: 'd'.repeat(3000), origin: 'agent.spawn' },
          lastDirectUserMessage: { text: 'Do not push', origin: 'composer' },
          omittedTaskContext: [],
        },
      },
      questions: {},
      rules: {},
    },
    new AbortController().signal,
  );

  expect(body).toMatchObject({
    state: {
      policy: 'complete policy',
      answerGuidance: 'Apply the policy.',
      lastUserMessage: 'Do not push',
      action: { input: { content } },
      taskContext: {
        originalUserTask: null,
        delegatedTask: null,
        lastDirectUserMessage: { text: 'Do not push', origin: 'composer' },
        omittedTaskContext: [
          { field: 'delegatedTask', reason: 'budget' },
          { field: 'originalUserTask', reason: 'budget' },
        ],
      },
    },
  });
});
