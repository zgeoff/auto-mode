import { faker } from '@faker-js/faker';
import type { DenialState } from '../../src/budget/types.ts';

type LastDenied = NonNullable<DenialState['lastDenied']>;

interface DenialStateOverrides extends Partial<Omit<DenialState, 'lastDenied'>> {
  readonly lastDenied?: Partial<LastDenied> | null;
}

export function buildMockDenialState(overrides: DenialStateOverrides = {}): DenialState {
  const { lastDenied, ...rest } = overrides;

  return {
    consecutive: 0,
    session: 0,
    ...rest,
    lastDenied:
      lastDenied === undefined || lastDenied === null
        ? null
        : {
            retryKey: faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' }),
            rule: faker.lorem.words(2),
            reason: faker.lorem.sentence(),
            ...lastDenied,
          },
  };
}
