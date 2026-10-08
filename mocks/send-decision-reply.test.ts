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

test('it refuses a request that carries the rules beside the questions', () => {
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

  expect(sendDecisionReply({ request })).rejects.toMatchObject({
    issues: expect.toPartiallyContain({ code: 'unrecognized_keys', keys: ['rules'], path: [] }),
  });
});

test('it refuses a question whose criteria leave out ask', () => {
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

  expect(sendDecisionReply({ request })).rejects.toMatchObject({
    issues: expect.toPartiallyContain({ path: ['questions', 'rule_0', 'criteria', 'ask'] }),
  });
});

test('it refuses a state without the action', () => {
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

  expect(sendDecisionReply({ request })).rejects.toMatchObject({
    issues: expect.toPartiallyContain({ path: ['state', 'action'] }),
  });
});
