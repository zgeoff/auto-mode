import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { recordedAnswerSchema } from './recorded-answer-schema.ts';

test('it accepts a choice with its confidence and allow, block, and ask probabilities', () => {
  expect(recordedAnswerSchema.safeParse(['ask', 0.6, 0.3, 0.1, 0.6]).data).toStrictEqual([
    'ask',
    0.6,
    0.3,
    0.1,
    0.6,
  ]);
});

test('it rejects a probability above 1', () => {
  const result = recordedAnswerSchema.safeParse(['ask', 0.6, 1.3, 0.1, 0.6]);

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: [2] });
});

test('it rejects a choice outside allow, block, and ask', () => {
  const result = recordedAnswerSchema.safeParse(['deny', 0.6, 0.3, 0.1, 0.6]);

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: [0] });
});
