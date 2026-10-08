import { expect, test } from 'bun:test';
import { buildMockProviderConfig } from './build-mock-provider-config.ts';

test('it builds a default provider config', () => {
  expect(buildMockProviderConfig()).toStrictEqual({
    protocol: 'system-one',
    baseURL: 'https://decision.test',
    model: expect.toBeString(),
    apiKeyEnv: 'AUTO_MODE_UNSET_TEST_KEY',
    apiKeyCommand: undefined,
    reasoning: false,
    maxTokens: 3000,
    timeoutMs: 5000,
  });
});

test('it applies overrides on top of the defaults', () => {
  const provider = buildMockProviderConfig({
    protocol: 'messages',
    baseURL: 'https://gateway.test',
    reasoning: true,
  });

  expect(provider).toStrictEqual({
    protocol: 'messages',
    baseURL: 'https://gateway.test',
    model: expect.toBeString(),
    apiKeyEnv: 'AUTO_MODE_UNSET_TEST_KEY',
    apiKeyCommand: undefined,
    reasoning: true,
    maxTokens: 3000,
    timeoutMs: 5000,
  });
});
