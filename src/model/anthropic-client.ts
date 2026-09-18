import type { ProviderConfig } from '../config/config.ts';

/**
 * The smallest Messages API client that does this job.
 *
 * There is no SDK here on purpose. This runs once per tool call, so process
 * start-up is on the critical path, and every supported provider — Anthropic,
 * Meta, z.ai, Moonshot — serves the same endpoint shape.
 */
export interface ModelRequest {
  readonly system: string;
  readonly user: string;
}

export interface ModelResult {
  readonly text: string;
  readonly cachedInputTokens: number;
  /** Tokens written to the cache. Non-zero only on the call that fills it. */
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
  const timer = setTimeout(() => controller.abort(), provider.timeoutMs);

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

        // The policy is identical on every call, so it is the cache prefix.
        // Measured at 22,001 cached against 36 new tokens on Spark.
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: request.user }],
      }),
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${(await response.text()).slice(0, 300)}`);
    }

    return readResult(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

function readResult(body: unknown): ModelResult {
  const root = asObject(body);
  const content = root['content'];
  const parts: string[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      const item = asObject(block);

      // Thinking blocks are skipped: the verdict is in the text block, and a
      // reasoning model puts a lot of near-miss wording in the thinking.
      if (item['type'] === 'text' && typeof item['text'] === 'string') {
        parts.push(item['text']);
      }
    }
  }

  const usage = asObject(root['usage']);

  return {
    text: parts.join('\n'),
    cachedInputTokens: count(usage['cache_read_input_tokens']),
    cacheWriteTokens: count(usage['cache_creation_input_tokens']),
    newInputTokens: count(usage['input_tokens']),
    outputTokens: count(usage['output_tokens']),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
