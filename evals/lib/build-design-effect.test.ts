import { expect, test } from 'bun:test';
import { buildDesignEffect } from './build-design-effect.ts';

test('it widens samples that split wholly by case to one effective sample per case', () => {
  const effect = buildDesignEffect([
    { cluster: 'a', value: 1 },
    { cluster: 'a', value: 1 },
    { cluster: 'a', value: 1 },
    { cluster: 'b', value: 0 },
    { cluster: 'b', value: 0 },
    { cluster: 'b', value: 0 },
  ]);

  expect(effect.designEffect).toBeCloseTo(6, 10);
  expect(effect.effectiveTotal).toBeCloseTo(1, 10);
  expect(effect.effectiveEvents).toBeCloseTo(0.5, 10);
});

test('it keeps one sample per case near its own size, apart from the small-sample factor', () => {
  const effect = buildDesignEffect(
    Array.from({ length: 10 }, (_, index) => ({ cluster: `c${index}`, value: index < 3 ? 1 : 0 })),
  );

  expect(effect.designEffect).toBeCloseTo(10 / 9, 10);
  expect(effect.effectiveTotal).toBeCloseTo(9, 10);
});

test('it never narrows samples that vary inside each case', () => {
  expect(
    buildDesignEffect([
      { cluster: 'a', value: 1 },
      { cluster: 'a', value: 0 },
      { cluster: 'b', value: 1 },
      { cluster: 'b', value: 0 },
    ]),
  ).toStrictEqual({ designEffect: 1, effectiveTotal: 4, effectiveEvents: 2 });
});

test('it leaves a count with no events at its own size', () => {
  expect(
    buildDesignEffect([
      { cluster: 'a', value: 0 },
      { cluster: 'a', value: 0 },
      { cluster: 'b', value: 0 },
    ]),
  ).toStrictEqual({ designEffect: 1, effectiveTotal: 3, effectiveEvents: 0 });
});

test('it leaves a count over a single case at its own size', () => {
  expect(
    buildDesignEffect([
      { cluster: 'a', value: 1 },
      { cluster: 'a', value: 0 },
    ]),
  ).toStrictEqual({ designEffect: 1, effectiveTotal: 2, effectiveEvents: 1 });
});
