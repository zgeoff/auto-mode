import { expect, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { DECISION_URL } from '../../mocks/handlers.ts';
import { server } from '../../mocks/node.ts';
import { buildMockDecisionQuestion } from '../../test-utils/factories/build-mock-decision-question.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import { sendShapeRequest } from './send-shape-request.ts';

test('it returns the model, the input tokens and the answers Jev gives', async () => {
  const outcome = await sendShapeRequest(buildMockProviderConfig(), 'test-key', {
    state: buildMockDecisionRequest().state,
    questions: { rule_0: buildMockDecisionQuestion() },
    signal: AbortSignal.timeout(5000),
  });

  expect(outcome).toStrictEqual({
    kind: 'success',
    model: 'jev-1.13.0',
    inputTokens: 400,
    answers: {
      rule_0: {
        type: 'choice',
        choice: 'allow',
        confidence: 1,
        probabilities: { allow: 1, block: 0 },
      },
    },
  });
});

test('it reports a redirect without following it', async () => {
  server.use(
    http.post(
      DECISION_URL,
      () => new HttpResponse(null, { status: 302, headers: { location: '/' } }),
    ),
  );

  const outcome = await sendShapeRequest(buildMockProviderConfig(), 'test-key', {
    state: buildMockDecisionRequest().state,
    questions: { rule_0: buildMockDecisionQuestion() },
    signal: AbortSignal.timeout(5000),
  });

  expect(outcome).toStrictEqual({ kind: 'failure', reason: 'redirect' });
});

test('it reports an error status by its code', async () => {
  server.use(http.post(DECISION_URL, () => HttpResponse.json({}, { status: 503 })));

  const outcome = await sendShapeRequest(buildMockProviderConfig(), 'test-key', {
    state: buildMockDecisionRequest().state,
    questions: { rule_0: buildMockDecisionQuestion() },
    signal: AbortSignal.timeout(5000),
  });

  expect(outcome).toStrictEqual({ kind: 'failure', reason: 'http-503' });
});

test('it reports a network failure', async () => {
  server.use(http.post(DECISION_URL, () => HttpResponse.error()));

  const outcome = await sendShapeRequest(buildMockProviderConfig(), 'test-key', {
    state: buildMockDecisionRequest().state,
    questions: { rule_0: buildMockDecisionQuestion() },
    signal: AbortSignal.timeout(5000),
  });

  expect(outcome).toStrictEqual({ kind: 'failure', reason: 'network' });
});

test('it reports an aborted request as a timeout', async () => {
  const outcome = await sendShapeRequest(buildMockProviderConfig(), 'test-key', {
    state: buildMockDecisionRequest().state,
    questions: { rule_0: buildMockDecisionQuestion() },
    signal: AbortSignal.abort(),
  });

  expect(outcome).toStrictEqual({ kind: 'failure', reason: 'timeout' });
});

test('it keeps the body of an answer it cannot read', async () => {
  server.use(http.post(DECISION_URL, () => HttpResponse.json({ answers: 'none' })));

  const outcome = await sendShapeRequest(buildMockProviderConfig(), 'test-key', {
    state: buildMockDecisionRequest().state,
    questions: { rule_0: buildMockDecisionQuestion() },
    signal: AbortSignal.timeout(5000),
  });

  expect(outcome).toStrictEqual({
    kind: 'failure',
    reason: 'invalid-response',
    detail: '{"answers":"none"}',
  });
});

test('it refuses questions that offer different choices', () => {
  const outcome = sendShapeRequest(buildMockProviderConfig(), 'test-key', {
    state: buildMockDecisionRequest().state,
    questions: {
      rule_0: buildMockDecisionQuestion(),
      categorical: {
        type: 'choice',
        instructions: 'Which rule refuses the action?',
        criteria: { none: 'No rule refuses it.', unclear: 'Not enough is known.' },
      },
    },
    signal: AbortSignal.timeout(5000),
  });

  expect(outcome).rejects.toThrow('Every question of a shape offers the same choices.');
});
