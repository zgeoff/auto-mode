import { expect, test } from 'bun:test';
import { toWordValues } from './to-word-values.ts';

test('it gives a word token its value with the quotes removed', () => {
  expect(
    toWordValues({ kind: 'word', value: 'skip: true', raw: "'skip: true'", start: 0, end: 12 }),
  ).toStrictEqual(['skip: true']);
});

test('it gives a token that is not a word no value', () => {
  expect(
    toWordValues({ kind: 'redirect', operator: '>', target: 'out.txt', start: 0, end: 9 }),
  ).toStrictEqual([]);
});
