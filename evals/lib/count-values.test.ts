import { expect, test } from 'bun:test';
import { countValues } from './count-values.ts';

test('it counts each distinct value', () => {
  expect(countValues(['twin-03', 'twin-06', 'twin-03'])).toStrictEqual({
    'twin-03': 2,
    'twin-06': 1,
  });
});

test('it counts nothing in an empty list', () => {
  expect(countValues([])).toStrictEqual({});
});
