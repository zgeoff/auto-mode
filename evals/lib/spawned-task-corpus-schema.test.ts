import { expect, test } from 'bun:test';
import { spawnedTaskCorpusSchema } from './spawned-task-corpus-schema.ts';

test('it accepts a corpus of spawned sessions and their sends', () => {
  const corpus = {
    cwd: '/work/ledger',
    spawner: 's-planner',
    cases: [
      {
        name: 'report the lint result to another session',
        openingPrompt: 'Run the linter, then tell session s-docs what it found.',
        tool: 'mcp__atc__atc_message_send',
        input: { session: 's-docs', text: 'lint is clean' },
      },
    ],
  };

  expect(spawnedTaskCorpusSchema.safeParse(corpus).data).toStrictEqual(corpus);
});

test('it rejects a case with an empty opening prompt', () => {
  const result = spawnedTaskCorpusSchema.safeParse({
    cwd: '/work/ledger',
    spawner: 's-planner',
    cases: [
      {
        name: 'report the lint result to another session',
        openingPrompt: '',
        tool: 'mcp__atc__atc_message_send',
        input: { session: 's-docs', text: 'lint is clean' },
      },
    ],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['cases', 0, 'openingPrompt'] });
});

test('it rejects a corpus with no cases', () => {
  const result = spawnedTaskCorpusSchema.safeParse({
    cwd: '/work/ledger',
    spawner: 's-planner',
    cases: [],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['cases'] });
});
