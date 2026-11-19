import { expect, test } from 'bun:test';
import { makeSeededRandom } from './make-seeded-random.ts';

test('it draws the mulberry32 sequence for a seed', () => {
  const random = makeSeededRandom(42);

  expect([random(), random(), random()]).toStrictEqual([
    0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
  ]);
});

test('it draws the same sequence for two generators with one seed', () => {
  const first = makeSeededRandom(7);
  const second = makeSeededRandom(7);

  expect([first(), first()]).toStrictEqual([second(), second()]);
});

test('it reads a seed beyond 32 bits as its low 32 bits', () => {
  expect(makeSeededRandom(2 ** 32 + 42)()).toBe(makeSeededRandom(42)());
});
