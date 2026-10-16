import { faker } from '@faker-js/faker';
import type { ScopeFinding } from '../../src/containment/types.ts';

export function buildMockScopeFinding(overrides: Partial<ScopeFinding> = {}): ScopeFinding {
  return { kind: 'path', target: faker.system.filePath(), ...overrides };
}
