import * as z from 'zod';
import type { ProviderConfig } from '../config/config.ts';
import { DecisionRequestError } from './decision-request-error.ts';
import type { DecisionRequest, DecisionResult } from './types.ts';

export async function sendDecision(
  provider: ProviderConfig,
  apiKey: string,
  request: DecisionRequest,
  signal?: Readonly<AbortSignal>,
): Promise<DecisionResult> {
  const input = {
    model: provider.model,
    state: { ...request.state },
    questions: request.questions,
  };

  let body = JSON.stringify(input);

  for (const field of ['delegatedTask', 'originalUserTask'] as const) {
    const context = input.state.taskContext;

    if (Buffer.byteLength(body) <= 100_000 || context === undefined || context[field] === null) {
      continue;
    }

    input.state.taskContext = {
      ...context,
      [field]: null,
      omittedTaskContext: [
        ...context.omittedTaskContext.filter((item) => item.field !== field),
        { field, reason: 'budget' },
      ],
    };

    body = JSON.stringify(input);
  }

  const requestBytes = Buffer.byteLength(body);

  if (requestBytes > 100_000) {
    throw new DecisionRequestError(
      'request-too-large',
      requestBytes,
      'Decision input exceeds 100000 bytes; refusing to truncate the action or user message',
    );
  }

  const controller = new AbortController();

  const stopRequest = () => {
    controller.abort();
  };

  signal?.addEventListener('abort', stopRequest, { once: true });

  if (signal?.aborted === true) {
    controller.abort();
  }

  const timer = setTimeout(() => {
    controller.abort();
  }, provider.timeoutMs);

  try {
    let response: Response;

    try {
      response = await fetch(`${provider.baseURL.replace(/\/$/, '')}/v1/systemone`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DecisionRequestError('aborted', requestBytes, 'Decision request aborted', {
          cause: error,
        });
      }

      throw new DecisionRequestError('network', requestBytes, 'Decision API request failed');
    }

    if (!response.ok) {
      throw new DecisionRequestError(
        'http-status',
        requestBytes,
        `Decision API returned HTTP ${response.status}`,
      );
    }

    const probability = z.number().min(0).max(1);

    const answer = z.object({
      type: z.literal('choice'),
      choice: z.enum(['allow', 'block', 'ask']),
      confidence: probability,
      probabilities: z.strictObject({ allow: probability, block: probability, ask: probability }),
    });

    const schema = z.object({
      model: z.string().min(1),
      answers: z.record(z.string(), answer),
      usage: z.object({ input_tokens: z.number().int().nonnegative() }),
    });

    let responseBody: unknown;

    try {
      responseBody = await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DecisionRequestError('aborted', requestBytes, 'Decision request aborted', {
          cause: error,
        });
      }

      throw new DecisionRequestError(
        'invalid-response',
        requestBytes,
        'Decision API returned invalid JSON',
      );
    }

    const parsedResponse = schema.safeParse(responseBody);

    if (!parsedResponse.success) {
      throw new DecisionRequestError(
        'invalid-response',
        requestBytes,
        'Decision API returned a malformed response',
      );
    }

    const parsed = parsedResponse.data;

    if (Object.keys(parsed.answers).length !== Object.keys(request.questions).length) {
      throw new DecisionRequestError(
        'invalid-response',
        requestBytes,
        'Decision API returned an incomplete answer set',
      );
    }

    for (const id of Object.keys(request.questions)) {
      const value = parsed.answers[id];

      if (value === undefined) {
        throw new DecisionRequestError(
          'invalid-response',
          requestBytes,
          'Decision API omitted a requested answer',
        );
      }

      const distribution = Object.values(value.probabilities);

      if (
        Math.abs(distribution.reduce((sum, p) => sum + p, 0) - 1) > 0.01 ||
        value.probabilities[value.choice] < Math.max(...distribution)
      ) {
        throw new DecisionRequestError(
          'invalid-response',
          requestBytes,
          'Decision API returned invalid probabilities',
        );
      }
    }

    return {
      model: parsed.model,
      answers: parsed.answers,
      inputTokens: parsed.usage.input_tokens,
      requestBytes,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stopRequest);
  }
}
