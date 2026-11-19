import { expect, test } from 'bun:test';
import { buildPairedDifference } from './build-paired-difference.ts';

test('it averages each case over its samples before taking the difference on shared cases', () => {
  expect(
    buildPairedDifference(
      [
        { cluster: 'a', value: 0 },
        { cluster: 'a', value: 0 },
        { cluster: 'b', value: 1 },
        { cluster: 'only-a', value: 1 },
      ],
      [
        { cluster: 'a', value: 1 },
        { cluster: 'a', value: 0 },
        { cluster: 'b', value: 1 },
        { cluster: 'only-b', value: 0 },
      ],
    ),
  ).toStrictEqual({ shared: 2, meanDifference: 0.25, standardError: 0.25 });
});

test('it leaves the error undefined for one shared case', () => {
  expect(
    buildPairedDifference([{ cluster: 'a', value: 0 }], [{ cluster: 'a', value: 1 }]),
  ).toStrictEqual({ shared: 1, meanDifference: 1, standardError: null });
});

test('it reports no difference for runs that share no case', () => {
  expect(
    buildPairedDifference([{ cluster: 'a', value: 0 }], [{ cluster: 'b', value: 1 }]),
  ).toStrictEqual({ shared: 0, meanDifference: null, standardError: null });
});
