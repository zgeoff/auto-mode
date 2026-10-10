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

test('it gives each case the answers recorded under its key when the answers are keyed by key', () => {
  const keyed = buildMockMeasurementCase({ id: 'control-39' });
  const other = buildMockMeasurementCase({ id: 'pair-01' });
  const answer = { kind: 'release', released: true, model: 'jev' } as const;

  const set = buildRecordedSet(
    {
      corpus: 'second-judge',
      dir: '/corpora/second-judge',
      cases: { 'held-out/control-39': keyed, b: other },
    },
    'jev',
    {
      input: { path: 'corpora:run#jev', hash: 'h' },
      keyedBy: 'key',
      answers: { 'held-out/control-39': { 0: answer }, 'pair-01': { 0: answer } },
    },
  );

  expect(set).toStrictEqual({
    corpus: 'second-judge',
    dir: '/corpora/second-judge',
    cases: {
      'held-out/control-39': { ...keyed, recorded: { jev: { 0: answer } } },
      b: other,
    },
  });
});
