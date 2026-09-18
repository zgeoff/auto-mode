// zod's .catch() is a schema fallback, not a promise handler; both rules below match the method name alone
// oxlint-disable promise/prefer-await-to-then
// oxlint-disable unicorn/prefer-top-level-await
import * as z from 'zod';
import type { ProviderConfig } from '../config/config.ts';

export interface ModelRequest {
  readonly system: string;
  readonly user: string;
}

export interface ModelResult {
  readonly text: string;
  readonly cachedInputTokens: number;
  readonly cacheWriteTokens: number;
  readonly newInputTokens: number;
  readonly outputTokens: number;
}

export async function callModel(
  provider: ProviderConfig,
  apiKey: string,
  request: ModelRequest,
): Promise<ModelResult> {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, provider.timeoutMs);

  try {
    const response = await fetch(`${provider.baseURL.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: provider.maxTokens,

        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: request.user }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();

      throw new Error(`${response.status} ${detail.slice(0, 300)}`);
    }

    const body: unknown = await response.json();

    return readResult(body);
  } finally {
    clearTimeout(timer);
  }
}

// Thinking blocks are dropped here: the verdict is in the text block, and a
// reasoning model puts a lot of near-miss wording in the thinking.
const textBlockSchema = z.object({ type: z.literal('text'), text: z.string() });
const contentBlockSchema = z.union([textBlockSchema, z.unknown().transform(() => null)]);
const tokens = z.number().catch(0).default(0);

// Every field falls back rather than failing: a response this shape cannot read
// yields empty text, and the caller already treats empty text as no answer.
const responseSchema = z
  .object({
    content: z.array(contentBlockSchema).catch([]),
    usage: z
      .object({
        cache_read_input_tokens: tokens,
        cache_creation_input_tokens: tokens,
        input_tokens: tokens,
        output_tokens: tokens,
      })
      .catch({
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
      }),
  })
  .catch({
    content: [],
    usage: {
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
    },
  });

function readResult(body: unknown): ModelResult {
  const response = responseSchema.parse(body);
  const parts = response.content.filter((block) => block !== null).map((block) => block.text);

  return {
    text: parts.join('\n'),
    cachedInputTokens: response.usage.cache_read_input_tokens,
    cacheWriteTokens: response.usage.cache_creation_input_tokens,
    newInputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
