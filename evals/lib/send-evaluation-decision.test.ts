import { expect, mock, test } from 'bun:test';
import { DecisionRequestError } from 'auto-mode';
import { HttpResponse, delay, http } from 'msw';
import { DECISION_URL } from '../../mocks/handlers.ts';
import { server } from '../../mocks/node.ts';
import { buildMockDecisionRequest } from '../../test-utils/factories/build-mock-decision-request.ts';
import { buildMockDecisionRule } from '../../test-utils/factories/build-mock-decision-rule.ts';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import { sendEvaluationDecision } from './send-evaluation-decision.ts';

test('it returns the answers Jev gives to the request', async () => {
  const request = buildMockDecisionRequest({ rules: { rule_0: buildMockDecisionRule() } });

  const result = await sendEvaluationDecision(buildMockProviderConfig(), 'test-key', request);

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
});

test('it sends the request through the fetch it is given', async () => {
  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- fetch's own signature takes a mutable RequestInit
  const sendFetch = mock((url: string, init: Readonly<RequestInit>) => fetch(url, init));

  await sendEvaluationDecision(buildMockProviderConfig(), 'test-key', buildMockDecisionRequest(), {
    fetch: sendFetch,
  });

  expect(sendFetch).toHaveBeenCalledExactlyOnceWith(
    'https://decision.test/v1/systemone',
    expect.objectContaining({ method: 'POST' }),
  );
});

test('it aborts a request that outlasts the provider timeout', () => {
  server.use(
    http.post(DECISION_URL, async () => {
      await delay('infinite');

      return HttpResponse.json({});
    }),
  );

  const response = sendEvaluationDecision(
    buildMockProviderConfig({ timeoutMs: 0.5 }),
    'test-key',
    buildMockDecisionRequest(),
  );

  expect(response).rejects.toThrowWithMessage(DecisionRequestError, /^Decision request aborted$/u);
  expect(response).rejects.toMatchObject({ reason: 'aborted', cause: { name: 'TimeoutError' } });
});
