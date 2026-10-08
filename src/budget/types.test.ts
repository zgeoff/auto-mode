import { expect, test } from 'bun:test';
import { EMPTY_DENIAL_STATE } from './types.ts';

test('it holds a denial state with no denial counted and none last', () => {
  expect(EMPTY_DENIAL_STATE).toStrictEqual({ consecutive: 0, session: 0, lastDenied: null });
});
