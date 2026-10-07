import { expect, test } from 'bun:test';
import { createMockActionRequest } from './create-mock-action-request.ts';

test('it builds a default action request', () => {
  expect(createMockActionRequest()).toStrictEqual({
    sessionID: expect.toBeString(),
    cwd: expect.toBeString(),
    toolName: 'Bash',
    toolInput: { command: expect.toBeString() },
  });
});

test('it applies overrides on top of the defaults', () => {
  const payload = createMockActionRequest({
    toolName: 'Read',
    toolInput: { file_path: '/repo/README.md' },
  });

  expect(payload.toolName).toBe('Read');
  expect(payload.toolInput).toStrictEqual({ file_path: '/repo/README.md' });
});
