import { faker } from '@faker-js/faker';
import type { MessagesResponse } from '../../src/model/anthropic-client.ts';

interface MessagesResponseOverrides extends Partial<Omit<MessagesResponse, 'usage'>> {
  readonly usage?: Partial<MessagesResponse['usage']>;
}

// One text block, because the verdict arrives in a text block; a test that
// reads a verdict sets the text it needs.
export function buildMockMessagesResponse(
  overrides: MessagesResponseOverrides = {},
): MessagesResponse {
  const { usage, ...rest } = overrides;

  return {
    content: [{ type: 'text', text: faker.lorem.sentence() }],
    ...rest,
    usage: {
      cache_read_input_tokens: faker.number.int({ max: 10_000 }),
      cache_creation_input_tokens: faker.number.int({ max: 10_000 }),
      input_tokens: faker.number.int({ max: 10_000 }),
      output_tokens: faker.number.int({ max: 1000 }),
      ...usage,
    },
  };
}
