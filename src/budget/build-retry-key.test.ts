import { expect, test } from 'bun:test';
import { buildMockActionRequest } from '../../test-utils/factories/build-mock-action-request.ts';
import { buildRetryKey } from './build-retry-key.ts';

const CONTEXT = {
  agentID: null,
  originalUserTask: null,
  delegatedTask: null,
  lastDirectUserMessage: { text: 'tidy the branch', origin: 'composer' },
  omittedTaskContext: [],
} as const;

test('it keys the same action the same way whatever its key order', () => {
  const first = buildMockActionRequest({
    cwd: '/repo',
    toolInput: { command: 'git push', other: 1 },
  });

  const second = buildMockActionRequest({
    cwd: '/repo',
    toolInput: { other: 1, command: 'git push' },
  });

  expect(buildRetryKey(first)).toBe(buildRetryKey(second));
});

test('it keys the same command in another directory as another action', () => {
  const here = buildMockActionRequest({ cwd: '/repo/a', toolInput: { command: 'rm x' } });
  const there = buildMockActionRequest({ cwd: '/repo/b', toolInput: { command: 'rm x' } });

  expect(buildRetryKey(here)).not.toBe(buildRetryKey(there));
});

test('it keys a Bash retry with a new description or timeout as the same action', () => {
  const denied = buildMockActionRequest({
    cwd: '/repo',
    toolInput: { command: 'git push', description: 'push the branch' },
  });

  const retried = buildMockActionRequest({
    cwd: '/repo',
    toolInput: {
      command: 'git push',
      description: 'publish the work',
      timeout: 60_000,
      run_in_background: true,
    },
  });

  expect(buildRetryKey(retried)).toBe(buildRetryKey(denied));
});

test('it keys the same action after a new direct user message as another action', () => {
  const before = buildMockActionRequest({
    cwd: '/repo',
    toolInput: { command: 'git push' },
    decisionContext: CONTEXT,
  });

  const after = buildMockActionRequest({
    cwd: '/repo',
    toolInput: { command: 'git push' },
    decisionContext: {
      ...CONTEXT,
      lastDirectUserMessage: { text: 'yes, push it', origin: 'composer' },
    },
  });

  expect(buildRetryKey(after)).not.toBe(buildRetryKey(before));
});
