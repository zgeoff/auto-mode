import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { replaySamplesSchema } from './replay-samples-schema.ts';

test('it reads the case, sample number, and release of each replay sample', () => {
  expect(
    replaySamplesSchema.safeParse({
      rule: 'release-all-allow',
      records: [
        ['T001', 1, 0],
        ['T001', 2, 1],
      ],
    }).data,
  ).toStrictEqual({
    records: [
      ['T001', 1, 0],
      ['T001', 2, 1],
    ],
  });
});

test('it rejects a release other than 0 or 1', () => {
  const result = replaySamplesSchema.safeParse({
    rule: 'release-all-allow',
    records: [
      ['T001', 1, 0],
      ['T001', 2, 2],
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['records', 1, 2] });
});
