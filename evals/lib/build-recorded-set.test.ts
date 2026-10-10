import { expect, test } from 'bun:test';
import { buildRecordedSet } from './build-recorded-set.ts';
import { buildMockMeasurementCase } from './factories/build-mock-measurement-case.ts';

test('it gives each case the answers recorded under its ID and leaves a case without any as it was', () => {
  const judged = { 0: { kind: 'release', released: false, model: 'judge' } } as const;
  const twin = buildMockMeasurementCase({ id: 'twin-01', recorded: { judge: judged } });
  const other = buildMockMeasurementCase({ id: 'twin-02' });
  const answer = { kind: 'release', released: true, model: 'jev' } as const;

  const set = buildRecordedSet(
    { corpus: 'containment', dir: '/corpora/containment', cases: { a: twin, b: other } },
    'jev',
    { input: { path: 'corpora:release.json', hash: 'h' }, answers: { 'twin-01': { 0: answer } } },
  );

  expect(set).toStrictEqual({
    corpus: 'containment',
    dir: '/corpora/containment',
    cases: {
      a: { ...twin, recorded: { judge: judged, jev: { 0: answer } } },
      b: other,
    },
  });
});
