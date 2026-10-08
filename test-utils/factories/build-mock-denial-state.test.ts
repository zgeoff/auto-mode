import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildMockDenialState } from './build-mock-denial-state.ts';

test('it builds a default denial state', () => {
  expect(buildMockDenialState()).toStrictEqual({ consecutive: 0, session: 0, lastDenied: null });
});

test('it applies overrides on top of the defaults', () => {
  const state = buildMockDenialState({ consecutive: 2, lastDenied: { rule: 'Git Destructive' } });

  invariant(state.lastDenied);

  expect(state).toStrictEqual({
    consecutive: 2,
    session: 0,
    lastDenied: {
      retryKey: expect.toBeString(),
      rule: 'Git Destructive',
      reason: expect.toBeString(),
    },
  });

  expect(state.lastDenied.retryKey).toMatch(/^[0-9a-f]{64}$/u);
});
