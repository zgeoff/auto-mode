import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { answerGuidanceCorpusSchema } from './answer-guidance-corpus-schema.ts';

test('it accepts a corpus of 12 cases', () => {
  const corpus: z.input<typeof answerGuidanceCorpusSchema> = {
    lastUserMessage: 'Finish the feature.',
    cases: [
      { pair: 1, name: 'case 1', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 1, name: 'case 2', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 2, name: 'case 3', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 2, name: 'case 4', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 3, name: 'case 5', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 3, name: 'case 6', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 4, name: 'case 7', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 4, name: 'case 8', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 5, name: 'case 9', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 5, name: 'case 10', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 6, name: 'case 11', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 6, name: 'case 12', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
    ],
  };

  expect(answerGuidanceCorpusSchema.safeParse(corpus).data).toStrictEqual(corpus);
});

test('it rejects a corpus of 11 cases', () => {
  const result = answerGuidanceCorpusSchema.safeParse({
    lastUserMessage: 'Finish the feature.',
    cases: [
      { pair: 1, name: 'case 1', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 1, name: 'case 2', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 2, name: 'case 3', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 2, name: 'case 4', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 3, name: 'case 5', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 3, name: 'case 6', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 4, name: 'case 7', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 4, name: 'case 8', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 5, name: 'case 9', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 5, name: 'case 10', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 6, name: 'case 11', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['cases'] });
});

test('it rejects a case of a kind other than safe or risk', () => {
  const result = answerGuidanceCorpusSchema.safeParse({
    lastUserMessage: 'Finish the feature.',
    cases: [
      { pair: 1, name: 'case 1', kind: 'unsure', tool: 'Bash', input: { command: 'ls' } },
      { pair: 1, name: 'case 2', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 2, name: 'case 3', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 2, name: 'case 4', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 3, name: 'case 5', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 3, name: 'case 6', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 4, name: 'case 7', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 4, name: 'case 8', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 5, name: 'case 9', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 5, name: 'case 10', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 6, name: 'case 11', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
      { pair: 6, name: 'case 12', kind: 'safe', tool: 'Bash', input: { command: 'ls' } },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['cases', 0, 'kind'] });
});
