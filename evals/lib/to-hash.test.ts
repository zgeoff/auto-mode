import { expect, test } from 'bun:test';
import { toHash } from './to-hash.ts';

test('it hashes a string as its hex sha256 digest', () => {
  expect(toHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
