import { expect, test } from 'bun:test';
import { classifyEdit } from '../../src/bypass/classify-edit.ts';
import { buildStubEditAction } from './build-stub-edit-action.ts';

test('it resolves an Edit against its cwd checkout and reads its old text as the file', () => {
  expect(
    buildStubEditAction({
      tool: 'Edit',
      input: { file_path: 'src/app.ts', old_string: 'one', new_string: 'two' },
      cwd: '/home/dev/app',
    }),
  ).toStrictEqual({
    toolName: 'Edit',
    toolInput: { file_path: 'src/app.ts', old_string: 'one', new_string: 'two' },
    requested: '/home/dev/app/src/app.ts',
    target: '/home/dev/app/src/app.ts',
    checkout: '/home/dev/app',
    current: 'one',
  });
});

test('it gives a Write no current file', () => {
  expect(
    buildStubEditAction({
      tool: 'Write',
      input: { file_path: '/home/dev/app/notes.md', content: 'notes' },
      cwd: '/home/dev/app',
    }),
  ).toStrictEqual({
    toolName: 'Write',
    toolInput: { file_path: '/home/dev/app/notes.md', content: 'notes' },
    requested: '/home/dev/app/notes.md',
    target: '/home/dev/app/notes.md',
    checkout: '/home/dev/app',
    current: null,
  });
});

test('it reads the notebook path of a NotebookEdit', () => {
  expect(
    buildStubEditAction({
      tool: 'NotebookEdit',
      input: { notebook_path: 'lab.ipynb', new_source: 'x = 1' },
      cwd: '/home/dev/app',
    }).target,
  ).toBe('/home/dev/app/lab.ipynb');
});

test('it targets the cwd for a call that is not a file-tool edit', () => {
  expect(
    buildStubEditAction({ tool: 'Bash', input: { command: 'ls' }, cwd: '/home/dev/app' }).target,
  ).toBe('/home/dev/app');
});

test('it gives an Edit that the bypass scans as the lines around its replacement', () => {
  const action = buildStubEditAction({
    tool: 'Edit',
    input: { file_path: 'src/app.ts', old_string: 'one', new_string: 'two' },
    cwd: '/home/dev/app',
  });

  expect(classifyEdit(action, { worktrees: ['/home/dev/app'], protectedDirs: [] })).toStrictEqual({
    kind: 'bypass',
    target: '/home/dev/app/src/app.ts',
  });
});
