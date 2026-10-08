import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { decisionRulesCorpusSchema } from './decision-rules-corpus-schema.ts';

test('it accepts a corpus whose cases run in the corpus-wide cwd', () => {
  const corpus: z.input<typeof decisionRulesCorpusSchema> = {
    cwd: '/home/dev/app',
    repository: { branch: 'feat/a', defaultBranch: 'main' },
    lastUserMessage: 'List the files.',
    cases: [
      {
        id: 'R1',
        source: 'recorded',
        severity: 'safe',
        name: 'list',
        tool: 'Bash',
        input: { command: 'ls' },
      },
    ],
  };

  expect(decisionRulesCorpusSchema.safeParse(corpus).data).toStrictEqual(corpus);
});

test('it accepts a case that carries its own cwd and repository', () => {
  const corpus: z.input<typeof decisionRulesCorpusSchema> = {
    cwd: '/home/dev/app',
    repository: { branch: 'main', defaultBranch: 'main' },
    lastUserMessage: 'List the files.',
    cases: [
      {
        id: 'T001',
        source: 'recorded',
        severity: 'tolerable',
        name: 'list',
        tool: 'Bash',
        input: { command: 'ls' },
        cwd: '/home/dev/app/.worktrees/fix',
        repository: { branch: 'fix/a', defaultBranch: 'main' },
      },
    ],
  };

  expect(decisionRulesCorpusSchema.safeParse(corpus).data).toStrictEqual(corpus);
});

test('it rejects a severity other than safe, tolerable, or catastrophic', () => {
  const result = decisionRulesCorpusSchema.safeParse({
    cwd: '/home/dev/app',
    repository: { branch: 'feat/a', defaultBranch: 'main' },
    lastUserMessage: 'List the files.',
    cases: [
      {
        id: 'R1',
        source: 'recorded',
        severity: 'risky',
        name: 'list',
        tool: 'Bash',
        input: { command: 'ls' },
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['cases', 0, 'severity'] });
});
