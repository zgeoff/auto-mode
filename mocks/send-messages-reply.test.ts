import { expect, test } from 'bun:test';
import { sendMessage } from '../src/model/anthropic-client.ts';
import { buildMockMessagesResponse } from '../test-utils/factories/build-mock-messages-response.ts';
import { buildMockProviderConfig } from '../test-utils/factories/build-mock-provider-config.ts';
import { MESSAGES_URL } from './handlers.ts';
import { messagesReplies } from './messages-replies.ts';
import { sendMessagesReply } from './send-messages-reply.ts';

test('it replies with the queued responses in order', async () => {
  const provider = buildMockProviderConfig({
    protocol: 'messages',
    baseURL: new URL(MESSAGES_URL).origin,
  });

  messagesReplies.push(
    buildMockMessagesResponse({
      content: [{ type: 'text', text: '<block>no</block>' }],
      usage: {
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        input_tokens: 10,
        output_tokens: 2,
      },
    }),
    buildMockMessagesResponse({
      content: [{ type: 'text', text: '<block>yes</block>' }],
      usage: {
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 0,
        input_tokens: 0,
        output_tokens: 3,
      },
    }),
  );

  const first = await sendMessage(
    provider,
    'key',
    { system: 'policy', user: 'first' },
    new AbortController().signal,
  );

  const second = await sendMessage(
    provider,
    'key',
    { system: 'policy', user: 'second' },
    new AbortController().signal,
  );

  expect(first).toStrictEqual({
    text: '<block>no</block>',
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    newInputTokens: 10,
    outputTokens: 2,
  });

  expect(second).toStrictEqual({
    text: '<block>yes</block>',
    cachedInputTokens: 10,
    cacheWriteTokens: 0,
    newInputTokens: 0,
    outputTokens: 3,
  });
});

test('it returns a server error when no reply is queued', () => {
  const provider = buildMockProviderConfig({
    protocol: 'messages',
    baseURL: new URL(MESSAGES_URL).origin,
  });

  expect(
    sendMessage(
      provider,
      'key',
      { system: 'policy', user: 'action' },
      new AbortController().signal,
    ),
  ).rejects.toThrowWithMessage(Error, /Messages API returned HTTP 500/u);
});

test('it answers HTTP 500 with the API error body when no reply is queued', async () => {
  const request = new Request(MESSAGES_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'test-model',
      max_tokens: 1024,
      system: [{ type: 'text', text: 'policy', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'action' }],
    }),
  });

  const response = await sendMessagesReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(500);

  expect(body).toStrictEqual({
    type: 'error',
    error: { type: 'api_error', message: 'no Messages reply is queued' },
  });
});

test('it answers a valid hand-built request with the queued reply', async () => {
  messagesReplies.push(
    buildMockMessagesResponse({
      content: [{ type: 'text', text: '<block>no</block>' }],
      usage: {
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        input_tokens: 10,
        output_tokens: 2,
      },
    }),
  );

  const request = new Request(MESSAGES_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'test-model',
      max_tokens: 1024,
      system: [{ type: 'text', text: 'policy', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'action' }],
    }),
  });

  const response = await sendMessagesReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(200);

  expect(body).toStrictEqual({
    content: [{ type: 'text', text: '<block>no</block>' }],
    usage: {
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      input_tokens: 10,
      output_tokens: 2,
    },
  });
});

test('it answers HTTP 400 for a request that carries a field the API does not know', async () => {
  const request = new Request(MESSAGES_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'test-model',
      max_tokens: 1024,
      system: [{ type: 'text', text: 'policy', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'action' }],
      temperature: 0,
    }),
  });

  const response = await sendMessagesReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(400);

  expect(body).toStrictEqual({
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message: 'temperature: Extra inputs are not permitted',
    },
  });
});

test('it answers HTTP 400 for a request body that is not JSON', async () => {
  const request = new Request(MESSAGES_URL, { method: 'POST', body: '{"model":' });

  const response = await sendMessagesReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(400);

  expect(body).toStrictEqual({
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message: 'body: the request body is not valid JSON',
    },
  });
});

test('it answers HTTP 400 for a request without max_tokens', async () => {
  const request = new Request(MESSAGES_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'test-model',
      system: [{ type: 'text', text: 'policy', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'action' }],
    }),
  });

  const response = await sendMessagesReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(400);

  expect(body).toStrictEqual({
    type: 'error',
    error: { type: 'invalid_request_error', message: expect.toStartWith('max_tokens: ') },
  });
});

test('it answers HTTP 400 for a request with no message', async () => {
  const request = new Request(MESSAGES_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'test-model',
      max_tokens: 1024,
      system: [{ type: 'text', text: 'policy', cache_control: { type: 'ephemeral' } }],
      messages: [],
    }),
  });

  const response = await sendMessagesReply({ request });
  const body: unknown = await response.json();

  expect(response.status).toBe(400);

  expect(body).toStrictEqual({
    type: 'error',
    error: { type: 'invalid_request_error', message: expect.toStartWith('messages: ') },
  });
});
