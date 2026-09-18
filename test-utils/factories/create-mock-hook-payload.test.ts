import { expect, test } from 'bun:test';
import { createMockHookPayload } from './create-mock-hook-payload.ts';

test('it builds a default hook payload', () => {
  expect(createMockHookPayload()).toStrictEqual({
    harness: 'claude',
    event: 'PreToolUse',
    sessionId: expect.toBeString(),
    cwd: expect.toBeString(),
    toolName: 'Bash',
    toolInput: { command: expect.toBeString() },
    raw: {},
  });
});

test('it applies overrides on top of the defaults', () => {
  const payload = createMockHookPayload({
    harness: 'muse',
    toolName: 'Read',
    toolInput: { file_path: '/repo/README.md' },
  });

  expect(payload.harness).toBe('muse');
  expect(payload.toolName).toBe('Read');
  expect(payload.toolInput).toStrictEqual({ file_path: '/repo/README.md' });
  expect(payload.event).toBe('PreToolUse');
});
