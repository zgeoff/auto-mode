import { faker } from '@faker-js/faker';
import type { HostEnvironment } from '../../src/config/types.ts';

// The default home does not exist, so a read under it never finds the real
// user's files; a test that reads or writes there passes its temp dir. The
// scratch paths stay absent, which leaves them to the containment default.
export function buildMockHostEnvironment(
  overrides: Partial<HostEnvironment> = {},
): HostEnvironment {
  return {
    env: {},
    home: `/nonexistent/${faker.string.alphanumeric(12)}`,
    ...overrides,
  };
}
