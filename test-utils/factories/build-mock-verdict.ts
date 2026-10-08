import { faker } from '@faker-js/faker';
import type { Verdict } from '../../src/request/types.ts';

type DenyVerdict = Extract<Verdict, { kind: 'deny' }>;

type VerdictOverrides = Partial<DenyVerdict> | { readonly kind: 'allow' };

// An allow carries no rule or reason, so an allow override takes no deny defaults.
export function buildMockVerdict(overrides: VerdictOverrides = {}): Verdict {
  if (overrides.kind === 'allow') {
    return { kind: 'allow' };
  }

  return { kind: 'deny', rule: faker.lorem.words(2), reason: faker.lorem.sentence(), ...overrides };
}
