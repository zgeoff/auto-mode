import { expect, mock, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import invariant from 'tiny-invariant';
import { server } from '../../mocks/node.ts';
import type { ProviderConfig } from '../config/config.ts';
import { sendMessage } from './anthropic-client.ts';

const PROVIDER: Readonly<ProviderConfig> = {
  baseURL: 'https://gateway.test',
  model: 'test-model',
  reasoning: true,
  maxTokens: 3000,
  timeoutMs: 5000,
};

const ENDPOINT = 'https://gateway.test/v1/messages';

test('it posts to the Messages endpoint with the key and version headers', async () => {
  const track = mock<(headers: Readonly<Record<string, string>>) => void>();

  server.use(
    http.post(ENDPOINT, (info) => {
      track({
        key: info.request.headers.get('x-api-key') ?? '',
        version: info.request.headers.get('anthropic-version') ?? '',
      });

      return HttpResponse.json({ content: [{ type: 'text', text: 'ok' }] });
    }),
  );

  await sendMessage(PROVIDER, 'secret-key', { system: 'policy', user: 'action' });

  expect(track).toHaveBeenCalledExactlyOnceWith({
    key: 'secret-key',
    version: '2023-06-01',
  });
});

// The policy is identical on every call, so it is the cache prefix and carries
// cache_control. Losing that marker costs full price on every call.
test('it marks the system prompt for caching', async () => {
  const track = mock<(body: unknown) => void>();

  server.use(
    http.post(ENDPOINT, async (info) => {
      const body: unknown = await info.request.json();

      track(body);

      return HttpResponse.json({ content: [] });
    }),
  );

  await sendMessage(PROVIDER, 'k', { system: 'the policy', user: 'the action' });

  expect(track).toHaveBeenCalledExactlyOnceWith({
    model: 'test-model',
    max_tokens: 3000,
    system: [{ type: 'text', text: 'the policy', cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: 'the action' }],
  });
});

test('it joins the text blocks of the answer', async () => {
  server.use(
    http.post(ENDPOINT, () =>
      HttpResponse.json({
        content: [
          { type: 'text', text: '<block>yes</block>' },
          { type: 'text', text: '<rule>History Rewrite</rule>' },
        ],
      }),
    ),
  );

  const result = await sendMessage(PROVIDER, 'k', { system: 's', user: 'u' });

  expect(result.text).toBe('<block>yes</block>\n<rule>History Rewrite</rule>');
});

// The verdict is in the text block, and a reasoning model puts a lot of
// near-miss wording in the thinking.
test('it drops a thinking block', async () => {
  server.use(
    http.post(ENDPOINT, () =>
      HttpResponse.json({
        content: [
          { type: 'thinking', thinking: 'this might be <block>yes</block>' },
          { type: 'text', text: '<block>no</block>' },
        ],
      }),
    ),
  );

  const result = await sendMessage(PROVIDER, 'k', { system: 's', user: 'u' });

  expect(result.text).toBe('<block>no</block>');
});

test('it reports the token counts the response carries', async () => {
  server.use(
    http.post(ENDPOINT, () =>
      HttpResponse.json({
        content: [{ type: 'text', text: 'ok' }],
        usage: {
          cache_read_input_tokens: 7025,
          cache_creation_input_tokens: 0,
          input_tokens: 42,
          output_tokens: 130,
        },
      }),
    ),
  );

  const result = await sendMessage(PROVIDER, 'k', { system: 's', user: 'u' });

  expect(result).toStrictEqual({
    text: 'ok',
    cachedInputTokens: 7025,
    cacheWriteTokens: 0,
    newInputTokens: 42,
    outputTokens: 130,
  });
});

test('it reports zero counts when the response carries no usage', async () => {
  server.use(http.post(ENDPOINT, () => HttpResponse.json({ content: [] })));

  const result = await sendMessage(PROVIDER, 'k', { system: 's', user: 'u' });

  expect(result).toStrictEqual({
    text: '',
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    newInputTokens: 0,
    outputTokens: 0,
  });
});

test('it reads a response it cannot understand as empty rather than failing', async () => {
  server.use(http.post(ENDPOINT, () => HttpResponse.json({ unexpected: 'shape' })));

  const result = await sendMessage(PROVIDER, 'k', { system: 's', user: 'u' });

  expect(result.text).toBe('');
});

test('it reports the status and body of a failed call', async () => {
  server.use(http.post(ENDPOINT, () => HttpResponse.text('over quota', { status: 429 })));

  const failure = await sendMessage(PROVIDER, 'k', { system: 's', user: 'u' }).catch(
    (error: unknown) => error,
  );

  invariant(failure instanceof Error, 'a non-ok response rejects with an Error');

  expect(failure.message).toInclude('429');
  expect(failure.message).toInclude('over quota');
});

test('it aborts a call that outlives the configured timeout', async () => {
  server.use(
    http.post(ENDPOINT, async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });

      return HttpResponse.json({ content: [] });
    }),
  );

  const failure = await sendMessage({ ...PROVIDER, timeoutMs: 20 }, 'k', {
    system: 's',
    user: 'u',
  }).catch((error: unknown) => error);

  invariant(failure instanceof Error, 'a timed-out call rejects with an Error');

  expect(failure.name).toBe('AbortError');
});

// The configured base URL may or may not carry a trailing slash.
test('it reaches the same endpoint whether the base URL ends in a slash', async () => {
  const track = mock<(url: string) => void>();

  server.use(
    http.post(ENDPOINT, (info) => {
      track(info.request.url);

      return HttpResponse.json({ content: [] });
    }),
  );

  await sendMessage({ ...PROVIDER, baseURL: 'https://gateway.test/' }, 'k', {
    system: 's',
    user: 'u',
  });

  expect(track).toHaveBeenCalledExactlyOnceWith(ENDPOINT);
});
