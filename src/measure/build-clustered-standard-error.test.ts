import { expect, test } from 'bun:test';
import { buildClusteredStandardError } from './build-clustered-standard-error.ts';

test('it widens the error when the samples of one case agree with each other', () => {
  expect(
    buildClusteredStandardError([
      { cluster: 'a', value: 1 },
      { cluster: 'a', value: 1 },
      { cluster: 'b', value: 0 },
      { cluster: 'b', value: 0 },
    ]),
  ).toStrictEqual({ mean: 0.5, clusters: 2, standardError: 0.5 });
});

test('it matches the independent error with the small-sample factor when every case has one sample', () => {
  const estimate = buildClusteredStandardError([
    { cluster: 'a', value: 1 },
    { cluster: 'b', value: 0 },
    { cluster: 'c', value: 0 },
    { cluster: 'd', value: 0 },
  ]);

  expect(estimate.mean).toBe(0.25);
  expect(estimate.clusters).toBe(4);

  expect(estimate.standardError).toBeCloseTo(
    Math.sqrt((4 / 3) * (0.75 ** 2 + 3 * 0.25 ** 2)) / 4,
    12,
  );
});

test('it leaves the error undefined for a single case', () => {
  expect(
    buildClusteredStandardError([
      { cluster: 'a', value: 1 },
      { cluster: 'a', value: 0 },
    ]),
  ).toStrictEqual({ mean: 0.5, clusters: 1, standardError: null });
});

test('it reports no estimate for no observations', () => {
  expect(buildClusteredStandardError([])).toStrictEqual({
    mean: 0,
    clusters: 0,
    standardError: null,
  });
});
