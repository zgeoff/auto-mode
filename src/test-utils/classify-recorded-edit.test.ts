import { expect, test } from 'bun:test';
import { classifyRecordedEdit } from './classify-recorded-edit.ts';

test('it lets a recorded Edit inside the cwd checkout skip Jev', async () => {
  const classification = await classifyRecordedEdit(
    {
      tool: 'Edit',
      input: { file_path: 'src/app.ts', old_string: 'one', new_string: 'two' },
      cwd: '/home/dev/app',
    },
    { branch: 'feat/a', defaultBranch: 'main' },
  );

  expect(classification).toStrictEqual({ kind: 'bypass', target: '/home/dev/app/src/app.ts' });
});

test('it sends a recorded Write outside the cwd checkout to Jev', async () => {
  const classification = await classifyRecordedEdit(
    {
      tool: 'Write',
      input: { file_path: '/home/dev/other/notes.md', content: 'notes' },
      cwd: '/home/dev/app',
    },
    { branch: 'feat/a', defaultBranch: 'main' },
  );

  expect(classification).toStrictEqual({
    kind: 'jev',
    reason: 'target outside every in-scope worktree',
  });
});

test('it sends a recorded Write to the auto-mode config under the cwd home to Jev', async () => {
  const classification = await classifyRecordedEdit(
    {
      tool: 'Write',
      input: { file_path: '/home/dev/.config/auto-mode/config.json', content: '{}' },
      cwd: '/home/dev',
    },
    { branch: null, defaultBranch: null },
  );

  expect(classification).toStrictEqual({
    kind: 'jev',
    reason: 'target is auto-mode configuration or state',
  });
});

test('it classifies nothing for a recorded call that is not a file-tool edit', async () => {
  const classification = await classifyRecordedEdit(
    { tool: 'Bash', input: { command: 'ls' }, cwd: '/home/dev/app' },
    { branch: 'feat/a', defaultBranch: 'main' },
  );

  expect(classification).toBeNull();
});
