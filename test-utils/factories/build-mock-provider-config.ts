import { faker } from '@faker-js/faker';
import type { ProviderConfig } from '../../src/config/config.ts';

export function buildMockProviderConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    protocol: 'system-one',
    baseURL: 'https://decision.test',
    model: faker.lorem.slug(2),
    apiKeyEnv: 'AUTO_MODE_UNSET_TEST_KEY',
    apiKeyCommand: undefined,
    reasoning: false,
    maxTokens: 3000,
    timeoutMs: 5000,
    ...overrides,
  };
}
