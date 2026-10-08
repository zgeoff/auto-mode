import { expect, test } from 'bun:test';
import { sendDecision } from '../src/model/send-decision.ts';
import { buildMockDecisionAnswer } from '../test-utils/factories/build-mock-decision-answer.ts';
import { buildMockDecisionQuestion } from '../test-utils/factories/build-mock-decision-question.ts';
import { buildMockDecisionRequest } from '../test-utils/factories/build-mock-decision-request.ts';
import { buildMockProviderConfig } from '../test-utils/factories/build-mock-provider-config.ts';
import { decisionAnswers } from './decision-answers.ts';
import { DECISION_URL } from './handlers.ts';
import { sendDecisionReply } from './send-decision-reply.ts';

test('it answers every question with a certain allow when no answer is set', async () => {
  const result = await sendDecision(
    buildMockProviderConfig({ baseURL: new URL(DECISION_URL).origin }),
    'key',
    buildMockDecisionRequest({
      questions: { rule_0: buildMockDecisionQuestion(), hard_deny_0: buildMockDecisionQuestion() },
    }),
    new AbortController().signal,
  );

  expect(result).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
      hard_deny_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
    inputTokens: 400,
    requestBytes: expect.toBePositive(),
  });
});

test('it answers a question with the answer set for its key', async () => {
  decisionAnswers.set(
    'rule_0',
    buildMockDecisionAnswer({
      choice: 'block',
      confidence: 0.9,
      probabilities: { allow: 0.1, block: 0.9, ask: 0 },
    }),
  );

  const result = await sendDecision(
    buildMockProviderConfig({ baseURL: new URL(DECISION_URL).origin }),
    'key',
    buildMockDecisionRequest({ questions: { rule_0: buildMockDecisionQuestion() } }),
    new AbortController().signal,
  );

  expect(result).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'block',
        confidence: 0.9,
        probabilities: { allow: 0.1, block: 0.9, ask: 0 },
      },
    },
    inputTokens: 400,
    requestBytes: expect.toBePositive(),
  });
});

test('it answers a request in the wire form the client sends', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(body).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
    usage: { input_tokens: 400 },
  });
});

test('it answers HTTP 400 for a request that carries the rules beside the questions', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
      rules: { rule_0: { name: 'Git Destructive', tier: 'soft', source: 'shipped', text: 'x' } },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(400);

  expect(body).toStrictEqual({
    detail: { error_type: 'api_usage_error', message: 'Invalid request.' },
  });
});

test('it answers HTTP 400 for a question of a type other than choice', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: {
        rule_0: {
          type: 'text',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(400);

  expect(body).toStrictEqual({
    detail: { error_type: 'api_usage_error', message: 'Invalid request.' },
  });
});

test('it answers a question whose criteria leave out ask', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(200);

  expect(body).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
    usage: { input_tokens: 400 },
  });
});

test('it answers a state without the action', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
      },
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(200);

  expect(body).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
    usage: { input_tokens: 400 },
  });
});

test('it answers HTTP 422 for a request without the model', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(422);

  expect(body).toStrictEqual({
    detail: [
      {
        type: 'missing',
        loc: ['body', 'model'],
        msg: 'Field required',
        input: {
          state: {
            policy: 'policy',
            answerGuidance: 'guidance',
            rulesSource: 'shipped',
            configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
            lastUserMessage: null,
            action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
          },
          questions: {
            rule_0: {
              type: 'choice',
              instructions: 'Is the action destructive?',
              criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
            },
          },
        },
      },
    ],
  });
});

test('it answers HTTP 422 for a model that is not text', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 42,
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(422);

  expect(body).toStrictEqual({
    detail: [
      {
        type: 'string_type',
        loc: ['body', 'model'],
        msg: 'Input should be a valid string',
        input: 42,
      },
    ],
  });
});

test('it answers HTTP 422 for a request without the state', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(422);

  expect(body).toStrictEqual({
    detail: [
      {
        type: 'missing',
        loc: ['body', 'state'],
        msg: 'Field required',
        input: {
          model: 'jev-1.13.0',
          questions: {
            rule_0: {
              type: 'choice',
              instructions: 'Is the action destructive?',
              criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
            },
          },
        },
      },
    ],
  });
});

test('it answers HTTP 422 for a null state as a missing one', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: null,
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(422);

  expect(body).toStrictEqual({
    detail: [
      {
        type: 'missing',
        loc: ['body', 'state'],
        msg: 'Field required',
        input: {
          model: 'jev-1.13.0',
          state: null,
          questions: {
            rule_0: {
              type: 'choice',
              instructions: 'Is the action destructive?',
              criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
            },
          },
        },
      },
    ],
  });
});

test('it answers HTTP 422 for a request without the questions', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(422);

  expect(body).toStrictEqual({
    detail: [
      {
        type: 'missing',
        loc: ['body', 'questions'],
        msg: 'Field required',
        input: {
          model: 'jev-1.13.0',
          state: {
            policy: 'policy',
            answerGuidance: 'guidance',
            rulesSource: 'shipped',
            configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
            lastUserMessage: null,
            action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
          },
        },
      },
    ],
  });
});

test('it answers HTTP 422 for questions sent as a list', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: [
        {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      ],
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(422);

  expect(body).toStrictEqual({
    detail: [
      {
        type: 'dict_type',
        loc: ['body', 'questions'],
        msg: 'Input should be a valid dictionary',
        input: [
          {
            type: 'choice',
            instructions: 'Is the action destructive?',
            criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
          },
        ],
      },
    ],
  });
});

test('it answers HTTP 422 for a request with no question', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: {},
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(422);

  expect(body).toStrictEqual({
    detail: [
      {
        type: 'too_short',
        loc: ['body', 'questions'],
        msg: 'Dictionary should have at least 1 item after validation, not 0',
        input: {},
        ctx: { actual_length: 0, field_type: 'Dictionary', min_length: 1 },
      },
    ],
  });
});

test('it answers HTTP 422 for a question that is not an object', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: { rule_0: 'Is the action destructive?' },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(422);

  expect(body).toStrictEqual({
    detail: [
      {
        type: 'model_attributes_type',
        loc: ['body', 'questions', 'rule_0'],
        msg: 'Input should be a valid dictionary or object to extract fields from',
        input: 'Is the action destructive?',
      },
    ],
  });
});

test('it answers HTTP 422 for a question without a type', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: {
        rule_0: {
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(422);

  expect(body).toStrictEqual({
    detail: [
      {
        type: 'union_tag_not_found',
        loc: ['body', 'questions', 'rule_0'],
        msg: "Unable to extract tag using discriminator 'type'",
        input: {
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
        ctx: { discriminator: "'type'" },
      },
    ],
  });
});

test('it answers HTTP 422 for a request body that is a list', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify([
      {
        model: 'jev-1.13.0',
        state: {
          policy: 'policy',
          answerGuidance: 'guidance',
          rulesSource: 'shipped',
          configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
          lastUserMessage: null,
          action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
        },
        questions: {
          rule_0: {
            type: 'choice',
            instructions: 'Is the action destructive?',
            criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
          },
        },
      },
    ]),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(422);

  expect(body).toStrictEqual({
    detail: [
      {
        type: 'model_attributes_type',
        loc: ['body'],
        msg: 'Input should be a valid dictionary or object to extract fields from',
        input: [
          {
            model: 'jev-1.13.0',
            state: {
              policy: 'policy',
              answerGuidance: 'guidance',
              rulesSource: 'shipped',
              configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
              lastUserMessage: null,
              action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
            },
            questions: {
              rule_0: {
                type: 'choice',
                instructions: 'Is the action destructive?',
                criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
              },
            },
          },
        ],
      },
    ],
  });
});

test('it answers HTTP 400 rather than 422 for an unknown field beside a missing model', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
      rules: {},
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(400);

  expect(body).toStrictEqual({
    detail: { error_type: 'api_usage_error', message: 'Invalid request.' },
  });
});

test('it answers a state that is not an object', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: 'policy',
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(200);

  expect(body).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
    usage: { input_tokens: 400 },
  });
});

test('it answers a state that carries an unknown field', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
        extra: true,
      },
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(200);

  expect(body).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
    usage: { input_tokens: 400 },
  });
});

test('it answers a question without instructions', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: {
        rule_0: {
          type: 'choice',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(200);

  expect(body).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
    usage: { input_tokens: 400 },
  });
});

test('it answers a question that carries an unknown field', async () => {
  const request = new Request(DECISION_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'jev-1.13.0',
      state: {
        policy: 'policy',
        answerGuidance: 'guidance',
        rulesSource: 'shipped',
        configuredRules: { environment: [], allow: [], soft_deny: [], hard_deny: [] },
        lastUserMessage: null,
        action: { tool: 'Bash', cwd: '/w/app', input: { command: 'ls' } },
      },
      questions: {
        rule_0: {
          type: 'choice',
          instructions: 'Is the action destructive?',
          criteria: { allow: 'no', block: 'yes', ask: 'unsure' },
          extra: true,
        },
      },
    }),
  });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(200);

  expect(body).toStrictEqual({
    model: 'jev-1.13.0',
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0, ask: 0 },
      },
    },
    usage: { input_tokens: 400 },
  });
});

test('it answers HTTP 422 for a request body that is not JSON', async () => {
  const request = new Request(DECISION_URL, { method: 'POST', body: '{"model":' });

  const response = await sendDecisionReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(422);

  expect(body).toStrictEqual({
    detail: [{ type: 'json_invalid', loc: ['body'], msg: 'JSON decode error', input: {} }],
  });
});
