import { expect, test } from 'bun:test';
import { resolveBlockThreshold } from './resolve-block-threshold.ts';

test('it reads the configured block threshold', () => {
  expect(resolveBlockThreshold({ blockThreshold: 0.35 })).toBe(0.35);
});

test('it falls back to the shipped block threshold of 0.2 when none is configured', () => {
  expect(resolveBlockThreshold({})).toBe(0.2);
});
