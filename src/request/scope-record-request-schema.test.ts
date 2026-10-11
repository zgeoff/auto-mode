import { expect, expectTypeOf, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type * as z from 'zod';
import type { ModScopeRecord } from '../../mods/auto-mode/contract/types.ts';
import { scopeRecordRequestSchema } from './scope-record-request-schema.ts';

test('it accepts a record request from the mod', () => {
  const payload = {
    sessionID: 'session-1',
    cwd: '/repo',
    startedAt: 1_791_000_000_000,
    command: 'git worktree add .worktrees/x -b x',
    resultText: "Preparing worktree (new branch 'x')",
  };

  const result = scopeRecordRequestSchema.safeParse(payload);

  expect(result.data).toStrictEqual(payload);
});

test('it rejects a record request with a field the mod does not send', () => {
  const result = scopeRecordRequestSchema.safeParse({
    sessionID: 'session-1',
    cwd: '/repo',
    startedAt: 1_791_000_000_000,
    command: 'git worktree add .worktrees/x -b x',
    resultText: "Preparing worktree (new branch 'x')",
    scope: { worktrees: ['/elsewhere'] },
  });

  invariant(result.error, 'the schema rejects the payload');

  expect(result.error.issues).toPartiallyContain({
    code: 'unrecognized_keys',
    keys: ['scope'],
    path: [],
  });
});

test('it rejects a record request without a start time', () => {
  const result = scopeRecordRequestSchema.safeParse({
    sessionID: 'session-1',
    cwd: '/repo',
    command: 'git worktree add .worktrees/x -b x',
    resultText: "Preparing worktree (new branch 'x')",
  });

  invariant(result.error, 'the schema rejects the payload');

  expect(result.error.issues).toPartiallyContain({ path: ['startedAt'] });
});

test('it accepts exactly the scope record shape the mod builds', () => {
  expectTypeOf<ModScopeRecord>().toExtend<z.input<typeof scopeRecordRequestSchema>>();
  expectTypeOf<z.input<typeof scopeRecordRequestSchema>>().toExtend<ModScopeRecord>();
});
