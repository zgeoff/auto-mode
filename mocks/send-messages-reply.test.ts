import { expect, test } from 'bun:test';
import { sendMessage } from '../src/model/anthropic-client.ts';
import { buildMockMessagesResponse } from '../test-utils/factories/build-mock-messages-response.ts';
import { buildMockProviderConfig } from '../test-utils/factories/build-mock-provider-config.ts';
import { MESSAGES_URL } from './handlers.ts';
import { messagesReplies } from './messages-replies.ts';

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
