import { expect, test } from 'bun:test';
import { buildMockMessagesResponse } from './build-mock-messages-response.ts';

test('it builds a default messages response', () => {
  expect(buildMockMessagesResponse()).toStrictEqual({
    content: [{ type: 'text', text: expect.toBeString() }],
    usage: {
      cache_read_input_tokens: expect.toBeNumber(),
      cache_creation_input_tokens: expect.toBeNumber(),
      input_tokens: expect.toBeNumber(),
      output_tokens: expect.toBeNumber(),
    },
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockMessagesResponse({
      content: [{ type: 'text', text: '<block>no</block>' }],
      usage: { input_tokens: 42 },
    }),
  ).toStrictEqual({
    content: [{ type: 'text', text: '<block>no</block>' }],
    usage: {
      cache_read_input_tokens: expect.toBeNumber(),
      cache_creation_input_tokens: expect.toBeNumber(),
      input_tokens: 42,
      output_tokens: expect.toBeNumber(),
    },
  });
});
