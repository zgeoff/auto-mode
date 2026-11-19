import { faker } from '@faker-js/faker';
import type { HostEnvironment } from '../../config/types.ts';

export function buildMockHostEnvironment(
  overrides: Partial<HostEnvironment> = {},
): HostEnvironment {
  return {
    env: {},
    home: `/nonexistent/${faker.string.alphanumeric(12)}`,
    ...overrides,
  };
}
