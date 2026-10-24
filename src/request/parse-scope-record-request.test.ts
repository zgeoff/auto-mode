import { expect, test } from 'bun:test';
import { parseScopeRecordRequest } from './parse-scope-record-request.ts';

test('it accepts a record request from the mod', () => {
  const body = {
    sessionID: 'session-1',
    cwd: '/repo',
    startedAt: 1_791_000_000_000,
    command: 'git worktree add .worktrees/x -b x',
    resultText: "Preparing worktree (new branch 'x')",
  };

  expect(parseScopeRecordRequest(body)).toStrictEqual(body);
});

test('it gives no record request for a body the schema rejects', () => {
  expect(
    parseScopeRecordRequest({
      sessionID: 'session-1',
      cwd: '/repo',
      command: 'git worktree add .worktrees/x -b x',
      resultText: "Preparing worktree (new branch 'x')",
    }),
  ).toBeNull();
});
