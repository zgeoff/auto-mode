import { expect, test } from 'claude-code/testing';
import { buildMockSessionContext } from './build-mock-session-context.ts';

test('it builds a default session context', () => {
  expect(buildMockSessionContext()).toStrictEqual({
    cwd: '/repo',
    session_id: 'session-1',
    transcript_path: '/repo/transcript.jsonl',
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockSessionContext({ session_id: 'worker-session', agent_id: 'worker' }),
  ).toStrictEqual({
    cwd: '/repo',
    session_id: 'worker-session',
    transcript_path: '/repo/transcript.jsonl',
    agent_id: 'worker',
  });
});
