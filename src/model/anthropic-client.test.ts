import { expect, mock, test } from 'bun:test';
import { HttpResponse, delay, http } from 'msw';
import { MESSAGES_URL } from '../../mocks/handlers.ts';
import { messagesReplies } from '../../mocks/messages-replies.ts';
import { server } from '../../mocks/node.ts';
import { buildMockMessagesResponse } from '../../test-utils/factories/build-mock-messages-response.ts';
import { buildMockProviderConfig } from '../../test-utils/factories/build-mock-provider-config.ts';
import type { MessagesErrorBody } from './anthropic-client.ts';
import { sendMessage } from './anthropic-client.ts';

test('it posts to the Messages endpoint with the key and version headers', async () => {
  const received = mock<(key: string | null, version: string | null) => void>();

  server.use(
    http.post(MESSAGES_URL, (info) => {
      received(
        info.request.headers.get('x-api-key'),
        info.request.headers.get('anthropic-version'),
      );
    }),
  );

  messagesReplies.push(
    buildMockMessagesResponse({
      content: [{ type: 'text', text: 'ok' }],
      usage: {
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
      },
    }),
  );

  const result = await sendMessage(
    buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test' }),
    'secret-key',
    { system: 'policy', user: 'action' },
    new AbortController().signal,
  );

  expect(received).toHaveBeenCalledExactlyOnceWith('secret-key', '2023-06-01');

  expect(result).toStrictEqual({
    text: 'ok',
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    newInputTokens: 0,
    outputTokens: 0,
  });
});

// The policy is identical on every call, so it is the cache prefix and carries
// cache_control. Losing that marker costs full price on every call.
test('it marks the system prompt for caching', async () => {
  const received = mock<(body: unknown) => void>();

  server.use(
    http.post(MESSAGES_URL, async (info) => {
      const body: unknown = await info.request.clone().json();

      received(body);
    }),
  );

  messagesReplies.push(
    buildMockMessagesResponse({
      content: [],
      usage: {
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
      },
    }),
  );

  const result = await sendMessage(
    buildMockProviderConfig({
      protocol: 'messages',
      baseURL: 'https://gateway.test',
      model: 'test-model',
      maxTokens: 3000,
    }),
    'k',
    { system: 'the policy', user: 'the action' },
    new AbortController().signal,
  );

  expect(received).toHaveBeenCalledExactlyOnceWith({
    model: 'test-model',
    max_tokens: 3000,
    system: [{ type: 'text', text: 'the policy', cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: 'the action' }],
  });

  expect(result).toStrictEqual({
    text: '',
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    newInputTokens: 0,
    outputTokens: 0,
  });
});

test('it joins the text blocks of the answer', async () => {
  messagesReplies.push(
    buildMockMessagesResponse({
      content: [
        { type: 'text', text: '<block>yes</block>' },
        { type: 'text', text: '<rule>History Rewrite</rule>' },
      ],
      usage: {
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
      },
    }),
  );

  const result = await sendMessage(
    buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test' }),
    'k',
    { system: 's', user: 'u' },
    new AbortController().signal,
  );

  expect(result).toStrictEqual({
    text: '<block>yes</block>\n<rule>History Rewrite</rule>',
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    newInputTokens: 0,
    outputTokens: 0,
  });
});

// The verdict is in the text block, and a reasoning model puts a lot of
// near-miss wording in the thinking.
test('it drops a thinking block', async () => {
  messagesReplies.push(
    buildMockMessagesResponse({
      content: [
        {
          type: 'thinking',
          thinking: 'this might be <block>yes</block>',
          signature: 'EqQBCkYIBxgCKkBthinking-signature',
        },
        { type: 'text', text: '<block>no</block>' },
      ],
      usage: {
        cache_read_input_tokens: 7025,
        cache_creation_input_tokens: 12,
        input_tokens: 42,
        output_tokens: 130,
      },
    }),
  );

  const result = await sendMessage(
    buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test' }),
    'k',
    { system: 's', user: 'u' },
    new AbortController().signal,
  );

  expect(result).toStrictEqual({
    text: '<block>no</block>',
    cachedInputTokens: 7025,
    cacheWriteTokens: 12,
    newInputTokens: 42,
    outputTokens: 130,
  });
});

test('it reports the token counts the response carries', async () => {
  messagesReplies.push(
    buildMockMessagesResponse({
      content: [{ type: 'text', text: 'ok' }],
      usage: {
        cache_read_input_tokens: 7025,
        cache_creation_input_tokens: 0,
        input_tokens: 42,
        output_tokens: 130,
      },
    }),
  );

  const result = await sendMessage(
    buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test' }),
    'k',
    { system: 's', user: 'u' },
    new AbortController().signal,
  );

  expect(result).toStrictEqual({
    text: 'ok',
    cachedInputTokens: 7025,
    cacheWriteTokens: 0,
    newInputTokens: 42,
    outputTokens: 130,
  });
});

test('it reports zero counts when the response carries no usage', async () => {
  server.use(http.post(MESSAGES_URL, () => HttpResponse.json({ content: [] })));

  const result = await sendMessage(
    buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test' }),
    'k',
    { system: 's', user: 'u' },
    new AbortController().signal,
  );

  expect(result).toStrictEqual({
    text: '',
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    newInputTokens: 0,
    outputTokens: 0,
  });
});

test('it reads a response it cannot understand as empty rather than failing', async () => {
  server.use(http.post(MESSAGES_URL, () => HttpResponse.json({ unexpected: 'shape' })));

  const result = await sendMessage(
    buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test' }),
    'k',
    { system: 's', user: 'u' },
    new AbortController().signal,
  );

  expect(result).toStrictEqual({
    text: '',
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    newInputTokens: 0,
    outputTokens: 0,
  });
});

test('it reports the status without the private body of a failed call', () => {
  server.use(
    http.post(MESSAGES_URL, () =>
      HttpResponse.json<MessagesErrorBody>(
        {
          type: 'error',
          error: { type: 'rate_limit_error', message: 'private over-quota detail' },
        },
        { status: 429 },
      ),
    ),
  );

  const response = sendMessage(
    buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test' }),
    'k',
    { system: 's', user: 'u' },
    new AbortController().signal,
  );

  expect(response).rejects.toThrowWithMessage(Error, /^Messages API returned HTTP 429$/u);
});

test('it aborts a call when its signal fires', () => {
  const timer = new AbortController();

  server.use(
    http.post(MESSAGES_URL, async () => {
      timer.abort();

      await delay('infinite');

      return HttpResponse.json({ content: [] });
    }),
  );

  const response = sendMessage(
    buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test' }),
    'k',
    { system: 's', user: 'u' },
    timer.signal,
  );

  expect(response).rejects.toBeInstanceOf(Error);
  expect(response).rejects.toMatchObject({ name: 'AbortError' });
});

// The configured base URL may or may not carry a trailing slash.
test('it reaches the same endpoint whether the base URL ends in a slash', async () => {
  const received = mock<(url: string) => void>();

  server.use(
    http.post(MESSAGES_URL, (info) => {
      received(info.request.url);
    }),
  );

  messagesReplies.push(
    buildMockMessagesResponse({
      content: [],
      usage: {
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
      },
    }),
  );

  const result = await sendMessage(
    buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test/' }),
    'k',
    { system: 's', user: 'u' },
    new AbortController().signal,
  );

  expect(received).toHaveBeenCalledExactlyOnceWith('https://gateway.test/v1/messages');

  expect(result).toStrictEqual({
    text: '',
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    newInputTokens: 0,
    outputTokens: 0,
  });
});

test('it discards malformed response text instead of exposing credential fragments', () => {
  server.use(http.post(MESSAGES_URL, () => HttpResponse.text('test-secret-prefix {')));

  const response = sendMessage(
    buildMockProviderConfig({ protocol: 'messages', baseURL: 'https://gateway.test' }),
    'test-secret-prefix-and-tail',
    { system: 'policy', user: 'action' },
    new AbortController().signal,
  );

  expect(response).rejects.toThrowWithMessage(Error, /^Messages API returned invalid JSON$/u);
});
