import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { staleConsentCorpusSchema } from './stale-consent-corpus-schema.ts';

test('it accepts a corpus of 6 pairs', () => {
  const corpus: z.input<typeof staleConsentCorpusSchema> = {
    cwd: '/home/dev/app',
    staleOrigin: 'composer',
    pairs: Array.from({ length: 6 }, (_, index) => ({
      pair: index + 1,
      action: 'push',
      name: `push ${index + 1}`,
      variant: 'earlier-consent',
      firstArm: 'stale',
      staleMessage: 'Push it.',
      tool: 'Bash',
      input: { command: 'git push' },
      repositoryContext: null,
    })),
  };

  expect(staleConsentCorpusSchema.safeParse(corpus).data).toStrictEqual(corpus);
});

test('it rejects a pair whose first arm is neither stale nor null', () => {
  const result = staleConsentCorpusSchema.safeParse({
    cwd: '/home/dev/app',
    staleOrigin: 'composer',
    pairs: Array.from({ length: 6 }, (_, index) => ({
      pair: index + 1,
      action: 'push',
      name: `push ${index + 1}`,
      variant: 'earlier-consent',
      firstArm: 'fresh',
      staleMessage: 'Push it.',
      tool: 'Bash',
      input: { command: 'git push' },
      repositoryContext: null,
    })),
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['pairs', 0, 'firstArm'] });
});
