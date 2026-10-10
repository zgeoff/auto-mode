import { expect, mock, test } from 'bun:test';
import { HttpResponse, delay, http } from 'msw';
import { decisionAnswers } from '../../mocks/decision-answers.ts';
import { DECISION_URL } from '../../mocks/handlers.ts';
import { server } from '../../mocks/node.ts';
import { buildStubStalledBody } from '../../test-utils/build-stub-stalled-body.ts';
import { buildMockClaudeRules } from '../../test-utils/factories/build-mock-claude-rules.ts';
import { buildMockDecisionAnswer } from '../../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionContext } from '../../test-utils/factories/build-mock-decision-context.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import { buildMockRepositoryContext } from '../../test-utils/factories/build-mock-repository-context.ts';
import type { DecisionResponse } from './build-decision-response-schema.ts';
import { DecisionRequestError } from './decision-request-error.ts';
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
  const request = buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } });

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
        probabilities: { allow: 1, block: 0 },
      },
    },
    inputTokens: 400,
    requestBytes: expect.toBePositive(),
  });

  expect(sentBytes).toHaveBeenCalledExactlyOnceWith(result.requestBytes);
});

test.each([
  ['0.99', 0.72, { block: 0.18, allow: 0.81 }],
  ['1.01', 0.81, { allow: 0.81, block: 0.2 }],
])(
  'it accepts two-decimal probabilities that sum to %s',
  async (_sum, confidence, probabilities) => {
    decisionAnswers.set(
      'rule_0',
      buildMockDecisionAnswer({ choice: 'allow', confidence, probabilities }),
    );

    const result = await sendDecision(
      buildMockProviderConfig(),
      'test-key',
      buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } }),
      new AbortController().signal,
    );

    expect(result).toStrictEqual({
      model: 'jev-1.13.0',
      answers: { rule_0: { type: 'choice', choice: 'allow', confidence, probabilities } },
      inputTokens: 400,
      requestBytes: expect.toBePositive(),
    });
  },
);

test.each([
  [
    'an unknown choice',
    {
      type: 'choice',
      choice: 'ignore',
      confidence: 0.8,
      probabilities: { allow: 0.8, block: 0.2 },
    },
  ],
  [
    'a confidence above 1',
    {
      type: 'choice',
      choice: 'allow',
      confidence: 2,
      probabilities: { allow: 0.8, block: 0.2 },
    },
  ],
  [
    'a missing probability',
    { type: 'choice', choice: 'allow', confidence: 0.8, probabilities: { allow: 0.8 } },
  ],
  [
    'an ask choice',
    {
      type: 'choice',
      choice: 'ask',
      confidence: 0.8,
      probabilities: { allow: 0.1, block: 0.1, ask: 0.8 },
    },
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
    buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } }),
    new AbortController().signal,
  );

  expect(response).rejects.toThrowWithMessage(
    DecisionRequestError,
    /^Decision API returned a malformed response$/u,
  );

  expect(response).rejects.toMatchObject({
    reason: 'invalid-response',
    requestBytes: expect.toBePositive(),
  });
});

test.each([
  ['no answer', []],
  ['an extra answer', ['rule_0', 'extra']],
] as const)('it rejects %s for one question as an incomplete answer set', (_label, answerIDs) => {
  server.use(
    http.post(DECISION_URL, () =>
      HttpResponse.json<DecisionResponse>({
        model: 'jev-1.13.0',
        answers: Object.fromEntries(answerIDs.map((id) => [id, buildMockDecisionAnswer()])),
        usage: { input_tokens: 400 },
      }),
    ),
  );

  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } }),
    new AbortController().signal,
  );

  expect(response).rejects.toThrowWithMessage(
    DecisionRequestError,
    /^Decision API returned an incomplete answer set$/u,
  );

  expect(response).rejects.toMatchObject({
    reason: 'invalid-response',
    requestBytes: expect.toBePositive(),
  });
});

test('it rejects an answer filed under a question it was not asked', () => {
  server.use(
    http.post(DECISION_URL, () =>
      HttpResponse.json<DecisionResponse>({
        model: 'jev-1.13.0',
        answers: {
          rule_1: buildMockDecisionAnswer(),
        },
        usage: { input_tokens: 400 },
      }),
    ),
  );

  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } }),
    new AbortController().signal,
  );

  expect(response).rejects.toThrowWithMessage(
    DecisionRequestError,
    /^Decision API omitted a requested answer$/u,
  );

  expect(response).rejects.toMatchObject({
    reason: 'invalid-response',
    requestBytes: expect.toBePositive(),
  });
});

test.each([
  ['a sum of 1.2', { allow: 0.6, block: 0.6 }],
  ['a sum of 0.98', { allow: 0.8, block: 0.18 }],
  ['a sum of 1.02', { allow: 0.8, block: 0.22 }],
  ['another winner', { allow: 0.2, block: 0.8 }],
  ['another winner at a sum of 0.99', { allow: 0.18, block: 0.81 }],
])(
  'it rejects probabilities with %s rather than turning them into an allow',
  (_label, probabilities) => {
    decisionAnswers.set(
      'rule_0',
      buildMockDecisionAnswer({ choice: 'allow', confidence: 0.8, probabilities }),
    );

    const response = sendDecision(
      buildMockProviderConfig(),
      'test-key',
      buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } }),
      new AbortController().signal,
    );

    expect(response).rejects.toThrowWithMessage(
      DecisionRequestError,
      /^Decision API returned invalid probabilities$/u,
    );

    expect(response).rejects.toMatchObject({
      reason: 'invalid-response',
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

  expect(response).rejects.toThrowWithMessage(DecisionRequestError, /^Decision request aborted$/u);

  expect(response).rejects.toMatchObject({
    reason: 'aborted',
    requestBytes: expect.toBePositive(),
    cause: { name: 'AbortError' },
  });
});

test('it aborts a request when its signal fires while the response body is read', () => {
  const timer = new AbortController();

  server.use(
    http.post(
      DECISION_URL,
      (info) =>
        new HttpResponse(
          buildStubStalledBody('{"model":', info.request.signal, () => {
            timer.abort();
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    ),
  );

  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest(),
    timer.signal,
  );

  expect(response).rejects.toThrowWithMessage(DecisionRequestError, /^Decision request aborted$/u);

  expect(response).rejects.toMatchObject({
    reason: 'aborted',
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

  expect(response).rejects.toThrowWithMessage(
    DecisionRequestError,
    /^Decision API request failed$/u,
  );

  expect(response).rejects.toMatchObject({
    reason: 'network',
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

  expect(response).rejects.toThrowWithMessage(
    DecisionRequestError,
    /^Decision input exceeds 100000 bytes; refusing to truncate the action or user message$/u,
  );

  expect(response).rejects.toMatchObject({
    reason: 'request-too-large',
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

  expect(response).rejects.toThrowWithMessage(
    DecisionRequestError,
    /^Decision API returned HTTP 401$/u,
  );

  expect(response).rejects.toMatchObject({
    reason: 'http-status',
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

  expect(response).rejects.toThrowWithMessage(
    DecisionRequestError,
    /^Decision API returned invalid JSON$/u,
  );

  expect(response).rejects.toMatchObject({
    reason: 'invalid-response',
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

  const provider = buildMockProviderConfig({ model: 'jev-test-model' });

  const repositoryContext = buildMockRepositoryContext({
    cwd: '/repo',
    branch: 'feature',
    defaultBranch: 'main',
    remotes: [],
  });

  const taskContext = buildMockDecisionContext({
    agentID: null,
    originalUserTask: { text: 't'.repeat(3000) },
    delegatedTask: { text: 'd'.repeat(3000) },
    lastDirectUserMessage: { text: 'Do not push' },
    omittedTaskContext: [],
  });

  const request = buildMockDecisionRequest({
    questions: {
      rule_0: {
        type: 'choice',
        instructions: 'Is the push allowed?',
        criteria: { allow: 'yes', block: 'no' },
      },
    },
    rules: {},
    state: {
      policy: 'complete policy',
      answerGuidance: 'Apply the policy.',
      rulesSource: 'shipped',
      configuredRules: buildMockClaudeRules(),
      lastUserMessage: 'Do not push',
      repositoryContext,
      action: { tool: 'Write', cwd: '/repo', input: { content: 'x'.repeat(99_000) } },
      taskContext,
    },
  });

  const result = await sendDecision(provider, 'test-key', request, new AbortController().signal);

  expect(result).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0 },
      },
    },
    inputTokens: 400,
    requestBytes: expect.toBePositive(),
  });

  expect(received).toHaveBeenCalledExactlyOnceWith({
    model: 'jev-test-model',
    state: {
      policy: 'complete policy',
      answerGuidance: 'Apply the policy.',
      rulesSource: 'shipped',
      configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
      lastUserMessage: 'Do not push',
      repositoryContext,
      action: { tool: 'Write', cwd: '/repo', input: { content: 'x'.repeat(99_000) } },
      taskContext: {
        ...taskContext,
        originalUserTask: null,
        delegatedTask: null,
        omittedTaskContext: [
          { field: 'delegatedTask', reason: 'budget' },
          { field: 'originalUserTask', reason: 'budget' },
        ],
      },
    },
    questions: {
      rule_0: {
        type: 'choice',
        instructions: 'Is the push allowed?',
        criteria: { allow: 'yes', block: 'no' },
      },
    },
  });
});

test('it reads answers over the choice set its caller names', async () => {
  server.use(
    http.post(DECISION_URL, () =>
      HttpResponse.json({
        model: 'jev-1.13.0',
        answers: {
          categorical: {
            type: 'choice',
            choice: 'none',
            confidence: 0.9,
            probabilities: { rule_0: 0.05, none: 0.9, unclear: 0.05 },
          },
        },
        usage: { input_tokens: 400 },
      }),
    ),
  );

  const result = await sendDecision(
    buildMockProviderConfig(),
    'test-key',
    {
      state: buildMockDecisionRequest().state,
      questions: {
        categorical: {
          type: 'choice',
          instructions: 'Which rule refuses the action?',
          criteria: { rule_0: 'The first rule', none: 'No rule', unclear: 'A fact is missing' },
        },
      },
    },
    new AbortController().signal,
    { choices: ['rule_0', 'none', 'unclear'] },
  );

  expect(result).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      categorical: {
        type: 'choice',
        choice: 'none',
        confidence: 0.9,
        probabilities: { rule_0: 0.05, none: 0.9, unclear: 0.05 },
      },
    },
    inputTokens: 400,
    requestBytes: expect.toBePositive(),
  });
});

test('it rejects an answer over choices outside the set its caller names', () => {
  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    {
      state: buildMockDecisionRequest().state,
      questions: {
        categorical: {
          type: 'choice',
          instructions: 'Which rule refuses the action?',
          criteria: { rule_0: 'The first rule', none: 'No rule', unclear: 'A fact is missing' },
        },
      },
    },
    new AbortController().signal,
    { choices: ['rule_0', 'none', 'unclear'] },
  );

  expect(response).rejects.toThrowWithMessage(
    DecisionRequestError,
    /^Decision API returned a malformed response$/u,
  );
});

test('it sends the request through the fetch its caller supplies', async () => {
  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- fetch's own signature takes a mutable RequestInit
  const sendFetch = mock((url: string, init: Readonly<RequestInit>) => fetch(url, init));

  const result = await sendDecision(
    buildMockProviderConfig({ baseURL: 'https://decision.test' }),
    'test-key',
    buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } }),
    new AbortController().signal,
    { fetch: sendFetch },
  );

  expect(sendFetch).toHaveBeenCalledExactlyOnceWith(
    'https://decision.test/v1/systemone',
    expect.objectContaining({ method: 'POST' }),
  );

  expect(result.model).toBe('jev-1.13.0');
});

test('it reports a request its timeout signal ends as aborted', () => {
  const timer = new AbortController();

  server.use(
    http.post(DECISION_URL, async () => {
      timer.abort(new DOMException('The operation timed out.', 'TimeoutError'));

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

  expect(response).rejects.toThrowWithMessage(DecisionRequestError, /^Decision request aborted$/u);

  expect(response).rejects.toMatchObject({
    reason: 'aborted',
    requestBytes: expect.toBePositive(),
    cause: { name: 'TimeoutError' },
  });
});

test('it reports the HTTP status when Jev rejects a request with no question as invalid', () => {
  const response = sendDecision(
    buildMockProviderConfig(),
    'test-key',
    buildMockDecisionRequest({ questions: {}, rules: {} }),
    new AbortController().signal,
  );

  expect(response).rejects.toThrowWithMessage(
    DecisionRequestError,
    /^Decision API returned HTTP 422$/u,
  );

  expect(response).rejects.toMatchObject({
    reason: 'http-status',
    requestBytes: expect.toBePositive(),
  });
});
