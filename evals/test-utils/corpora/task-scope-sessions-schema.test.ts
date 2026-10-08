import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import { taskScopeSessionsSchema } from './task-scope-sessions-schema.ts';

test('it accepts recorded sessions of corpus actions and scope calls', () => {
  const recording: z.input<typeof taskScopeSessionsSchema> = {
    home: '/home/dev',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    worktreeBranches: { '/home/dev/app-fix': 'fix/a' },
    pullRequestHeads: { '7': 'fix/a' },
    atc: { one: { format: 'atc.session-record' } },
    sessions: [
      {
        name: 'one',
        entries: [
          { case: 'T001' },
          {
            cwd: '/home/dev/app',
            command: 'git worktree add ../app-fix -b fix/a',
            succeeded: true,
            resultText: '',
          },
        ],
      },
    ],
  };

  expect(taskScopeSessionsSchema.safeParse(recording).data).toStrictEqual(recording);
});

test('it rejects a session entry that is neither an action nor a call', () => {
  const result = taskScopeSessionsSchema.safeParse({
    home: '/home/dev',
    remotes: [{ name: 'origin', url: 'git@github.com:dev/app.git' }],
    worktreeBranches: { '/home/dev/app-fix': 'fix/a' },
    pullRequestHeads: { '7': 'fix/a' },
    atc: { one: { format: 'atc.session-record' } },
    sessions: [
      {
        name: 'one',
        entries: [
          { case: 'T001', cwd: '/home/dev/app' },
          {
            cwd: '/home/dev/app',
            command: 'git worktree add ../app-fix -b fix/a',
            succeeded: true,
            resultText: '',
          },
        ],
      },
    ],
  });

  invariant(result.error);

  expect(result.error.issues).toPartiallyContain({ path: ['sessions', 0, 'entries', 0] });
});
