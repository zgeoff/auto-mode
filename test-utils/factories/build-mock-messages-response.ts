import { faker } from '@faker-js/faker';
import type { MessagesResponse } from '../../src/messages/anthropic-client.ts';

interface MessagesResponseOverrides extends Partial<Omit<MessagesResponse, 'usage'>> {
  readonly usage?: Partial<MessagesResponse['usage']>;
}

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
