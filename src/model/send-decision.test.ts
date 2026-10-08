import { expect, mock, test } from 'bun:test';
import { HttpResponse, delay, http } from 'msw';
import { decisionAnswers } from '../../mocks/decision-answers.ts';
import { DECISION_URL } from '../../mocks/handlers.ts';
import { server } from '../../mocks/node.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import type { DecisionResponse } from './decision-response-schema.ts';
import { sendDecision } from './send-decision.ts';

test('it authenticates a structured decision request and reads typed probabilities', async () => {
  const received = mock<(authorization: string | null, body: unknown) => void>();
  const sentBytes = mock<(bytes: number) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const text = await info.request.clone().text();

      received(info.request.headers.get('authorization'), JSON.parse(text));
      sentBytes(Buffer.byteLength(text));
    }),
  );

  const provider = buildMockProviderConfig({ baseURL: 'https://decision.test/' });
  const request = buildMockDecisionRequest();

  const result = await sendDecision(provider, 'test-key', request, new AbortController().signal);

  expect(received).toHaveBeenCalledExactlyOnceWith('Bearer test-key', {
    model: provider.model,
    state: request.state,
    questions: request.questions,
  });

  expect(result).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
    inputTokens: 400,
    requestBytes: expect.toBePositive(),
  });

  expect(sentBytes).toHaveBeenCalledExactlyOnceWith(result.requestBytes);
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
  decisionAnswers.set('rule_0', answer);

  const result = await sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest(),
    new AbortController().signal,
  );

  expect(result).toStrictEqual({
    model: 'jev-1.13.0',
    answers: { rule_0: answer },
    inputTokens: 400,
    requestBytes: expect.toBePositive(),
  });
});

test.each([
  [
    'an unknown choice',
    {
      type: 'choice',
      choice: 'ignore',
      confidence: 0.8,
      probabilities: { allow: 0.8, block: 0.1, ask: 0.1 },
    },
  ],
  [
    'a confidence above 1',
    {
      type: 'choice',
      choice: 'allow',
      confidence: 2,
      probabilities: { allow: 0.8, block: 0.1, ask: 0.1 },
    },
  ],
  [
    'a missing probability',
    { type: 'choice', choice: 'allow', confidence: 0.8, probabilities: { allow: 0.8, block: 0.1 } },
  ],
])('it rejects an answer with %s as a malformed response', (_label, answer) => {
  server.use(
    http.post(DECISION_URL, () =>
      HttpResponse.json({
        model: 'jev-1.13.0',
        answers: { rule_0: answer },
        usage: { input_tokens: 400 },
      }),
    ),
  );

  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest(),
    new AbortController().signal,
  );

  expect(response).rejects.toMatchObject({
    reason: 'invalid-response',
    message: 'Decision API returned a malformed response',
    requestBytes: expect.toBePositive(),
  });
});

test.each([
  ['no answer', {}],
  [
    'an extra answer',
    {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 0.8,
        probabilities: { allow: 0.8, block: 0.1, ask: 0.1 },
      },
      extra: {
        type: 'choice',
        choice: 'allow',
        confidence: 0.8,
        probabilities: { allow: 0.8, block: 0.1, ask: 0.1 },
      },
    },
  ],
] as const)('it rejects %s for one question as an incomplete answer set', (_label, answers) => {
  server.use(
    http.post(DECISION_URL, () =>
      HttpResponse.json<DecisionResponse>({
        model: 'jev-1.13.0',
        answers,
        usage: { input_tokens: 400 },
      }),
    ),
  );

  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest(),
    new AbortController().signal,
  );

  expect(response).rejects.toMatchObject({
    reason: 'invalid-response',
    message: 'Decision API returned an incomplete answer set',
    requestBytes: expect.toBePositive(),
  });
});

test('it rejects an answer filed under a question it was not asked', () => {
  server.use(
    http.post(DECISION_URL, () =>
      HttpResponse.json<DecisionResponse>({
        model: 'jev-1.13.0',
        answers: {
          rule_1: {
            type: 'choice',
            choice: 'allow',
            confidence: 0.8,
            probabilities: { allow: 0.8, block: 0.1, ask: 0.1 },
          },
        },
        usage: { input_tokens: 400 },
      }),
    ),
  );

  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest(),
    new AbortController().signal,
  );

  expect(response).rejects.toMatchObject({
    reason: 'invalid-response',
    message: 'Decision API omitted a requested answer',
    requestBytes: expect.toBePositive(),
  });
});

test.each([
  ['a sum of 1.2', { allow: 0.6, block: 0.6, ask: 0 }],
  ['a sum of 0.98', { allow: 0.8, block: 0.1, ask: 0.08 }],
  ['a sum of 1.02', { allow: 0.8, block: 0.1, ask: 0.12 }],
  ['another winner', { allow: 0.1, block: 0.8, ask: 0.1 }],
  ['another winner at a sum of 0.99', { allow: 0.1, block: 0.81, ask: 0.08 }],
])(
  'it rejects probabilities with %s rather than turning them into an allow',
  (_label, probabilities) => {
    decisionAnswers.set('rule_0', {
      type: 'choice',
      choice: 'allow',
      confidence: 0.8,
      probabilities,
    });

    const response = sendDecision(
      buildMockProviderConfig(),
      'test-key',
      buildMockDecisionRequest(),
      new AbortController().signal,
    );

    expect(response).rejects.toMatchObject({
      reason: 'invalid-response',
      message: 'Decision API returned invalid probabilities',
      requestBytes: expect.toBePositive(),
    });
  },
);

test('it aborts a request when its signal fires and reports the request size', () => {
  const timer = new AbortController();

  server.use(
    http.post(DECISION_URL, async () => {
      timer.abort();

      await delay('infinite');

      return HttpResponse.json({});
    }),
  );

  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest(),
    timer.signal,
  );

  expect(response).rejects.toMatchObject({
    reason: 'aborted',
    message: 'Decision request aborted',
    requestBytes: expect.toBePositive(),
    cause: { name: 'AbortError' },
  });
});

test('it reports a failed connection as a network failure', () => {
  server.use(http.post(DECISION_URL, () => HttpResponse.error()));

  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest(),
    new AbortController().signal,
  );

  expect(response).rejects.toMatchObject({
    reason: 'network',
    message: 'Decision API request failed',
    requestBytes: expect.toBePositive(),
  });
});

test('it refuses oversized input before a request without truncating it', () => {
  const requested = mock();

  server.use(
    http.post(DECISION_URL, () => {
      requested();
    }),
  );

  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest({
      state: {
        action: {
          tool: 'Write',
          input: { content: `${'x'.repeat(100_001)} remove the auth check` },
        },
      },
    }),
    new AbortController().signal,
  );

  expect(response).rejects.toMatchObject({
    reason: 'request-too-large',
    message: 'Decision input exceeds 100000 bytes; refusing to truncate the action or user message',
    requestBytes: expect.toBeWithin(100_001, Infinity),
  });

  expect(requested).not.toHaveBeenCalled();
});

test('it omits the response body from an HTTP error', () => {
  server.use(
    http.post(DECISION_URL, () => HttpResponse.text('private request content', { status: 401 })),
  );

  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest(),
    new AbortController().signal,
  );

  expect(response).rejects.toMatchObject({
    reason: 'http-status',
    message: 'Decision API returned HTTP 401',
    requestBytes: expect.toBePositive(),
  });
});

test('it discards a malformed JSON body instead of exposing credential fragments', () => {
  server.use(http.post(DECISION_URL, () => HttpResponse.text('test-secret-prefix {')));

  const response = sendDecision(
    buildMockProviderConfig(),
    'test-secret-prefix-and-tail',
    buildMockDecisionRequest(),
    new AbortController().signal,
  );

  expect(response).rejects.toMatchObject({
    reason: 'invalid-response',
    message: 'Decision API returned invalid JSON',
    requestBytes: expect.toBePositive(),
  });
});

test('it removes optional tasks to keep a complete action near the request limit', async () => {
  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(DECISION_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  const provider = buildMockProviderConfig();

  const request = buildMockDecisionRequest({
    questions: {},
    rules: {},
    state: {
      policy: 'complete policy',
      lastUserMessage: 'Do not push',
      action: { tool: 'Write', input: { content: 'x'.repeat(99_000) } },
      taskContext: {
        originalUserTask: { text: 't'.repeat(3000), origin: 'composer' },
        delegatedTask: { text: 'd'.repeat(3000), origin: 'agent.spawn' },
        lastDirectUserMessage: { text: 'Do not push', origin: 'composer' },
      },
    },
  });

  await sendDecision(provider, 'test-key', request, new AbortController().signal);

  expect(received).toHaveBeenCalledExactlyOnceWith({
    model: provider.model,
    state: {
      ...request.state,
      taskContext: {
        agentID: null,
        originalUserTask: null,
        delegatedTask: null,
        lastDirectUserMessage: { text: 'Do not push', origin: 'composer' },
        omittedTaskContext: [
          { field: 'delegatedTask', reason: 'budget' },
          { field: 'originalUserTask', reason: 'budget' },
        ],
      },
    },
    questions: {},
  });
});
