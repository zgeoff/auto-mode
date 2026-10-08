import { expect, test } from 'bun:test';
import { buildStubEditFileReader } from './build-stub-edit-file-reader.ts';

test('it resolves every path to itself', async () => {
  const reader = buildStubEditFileReader({
    tool: 'Write',
    input: { file_path: 'notes.md', content: 'notes' },
    cwd: '/home/dev/app',
  });

  const target = await reader.resolveEditTarget('/home/dev/app/link.md');

  expect(target).toBe('/home/dev/app/link.md');
});

test('it places every path in the checkout of the call cwd', async () => {
  const reader = buildStubEditFileReader({
    tool: 'Write',
    input: { file_path: '/elsewhere/notes.md', content: 'notes' },
    cwd: '/home/dev/app',
  });

  const checkout = await reader.findCheckout('/elsewhere', {});

  expect(checkout).toStrictEqual({ worktree: '/home/dev/app', commonDir: '/home/dev/app/.git' });
});

test('it reads the old text of an Edit as its file', async () => {
  const reader = buildStubEditFileReader({
    tool: 'Edit',
    input: { file_path: 'src/app.ts', old_string: 'one', new_string: 'two' },
    cwd: '/home/dev/app',
  });

  const content = await reader.readFile('/home/dev/app/src/app.ts');

  expect(content).toBe('one');
});

test('it reads no file for a call without old text', () => {
  const reader = buildStubEditFileReader({
    tool: 'Write',
    input: { file_path: 'notes.md', content: 'notes' },
    cwd: '/home/dev/app',
  });

  expect(reader.readFile('/home/dev/app/notes.md')).rejects.toThrowWithMessage(
    Error,
    'The recording holds no content for /home/dev/app/notes.md',
  );
});
