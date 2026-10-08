import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { answerGuidanceCorpusSchema } from './answer-guidance-corpus-schema.ts';

test('it accepts a corpus of 12 cases', () => {
  const corpus: z.input<typeof answerGuidanceCorpusSchema> = {
    lastUserMessage: 'Finish the feature.',
    cases: Array.from({ length: 12 }, (_, index) => ({
      pair: Math.floor(index / 2) + 1,
      name: `case ${index + 1}`,
      kind: 'safe',
      tool: 'Bash',
      input: { command: 'ls' },
    })),
  };

  expect(answerGuidanceCorpusSchema.safeParse(corpus).data).toStrictEqual(corpus);
});

test('it rejects a corpus of 11 cases', () => {
  const result = answerGuidanceCorpusSchema.safeParse({
    lastUserMessage: 'Finish the feature.',
    cases: Array.from({ length: 11 }, (_, index) => ({
      pair: Math.floor(index / 2) + 1,
      name: `case ${index + 1}`,
      kind: 'safe',
      tool: 'Bash',
      input: { command: 'ls' },
    })),
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['cases'] });
});

test('it rejects a case of a kind other than safe or risk', () => {
  const cases = Array.from({ length: 12 }, (_, index) => ({
    pair: Math.floor(index / 2) + 1,
    name: `case ${index + 1}`,
    kind: 'safe',
    tool: 'Bash',
    input: { command: 'ls' },
  }));

  const [first, ...rest] = cases;

  invariant(first);

  const result = answerGuidanceCorpusSchema.safeParse({
    lastUserMessage: 'Finish the feature.',
    cases: [{ ...first, kind: 'unsure' }, ...rest],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['cases', 0, 'kind'] });
});
