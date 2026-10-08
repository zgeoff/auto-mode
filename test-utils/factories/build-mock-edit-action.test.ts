import { expect, test } from 'bun:test';
import { buildMockEditAction } from './build-mock-edit-action.ts';

test('it builds a default edit action', () => {
  expect(buildMockEditAction()).toStrictEqual({
    toolName: 'Write',
    toolInput: { file_path: expect.toStartWith('/'), content: expect.toBeString() },
    requested: expect.toStartWith('/'),
    target: expect.toStartWith('/'),
    checkout: null,
    current: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  const action = buildMockEditAction({
    toolInput: { content: '# notes' },
    requested: '/repo/link/a.ts',
    target: '/outside/a.ts',
    checkout: '/repo',
    current: 'a\n',
  });

  expect(action).toStrictEqual({
    toolName: 'Write',
    toolInput: { file_path: '/outside/a.ts', content: '# notes' },
    requested: '/repo/link/a.ts',
    target: '/outside/a.ts',
    checkout: '/repo',
    current: 'a\n',
  });
});

test('it writes to the overridden target when no other path is given', () => {
  const action = buildMockEditAction({ target: '/repo/a.ts' });

  expect(action).toStrictEqual({
    toolName: 'Write',
    toolInput: { file_path: '/repo/a.ts', content: expect.toBeString() },
    requested: '/repo/a.ts',
    target: '/repo/a.ts',
    checkout: null,
    current: null,
  });
});

test('it builds the tool input an Edit takes', () => {
  const action = buildMockEditAction({ toolName: 'Edit', target: '/repo/a.ts' });

  expect(action).toStrictEqual({
    toolName: 'Edit',
    toolInput: {
      file_path: '/repo/a.ts',
      old_string: expect.toBeString(),
      new_string: expect.toBeString(),
    },
    requested: '/repo/a.ts',
    target: '/repo/a.ts',
    checkout: null,
    current: null,
  });
});

test('it builds the tool input a NotebookEdit takes', () => {
  const action = buildMockEditAction({ toolName: 'NotebookEdit', target: '/repo/n.ipynb' });

  expect(action).toStrictEqual({
    toolName: 'NotebookEdit',
    toolInput: { notebook_path: '/repo/n.ipynb', new_source: expect.toBeString() },
    requested: '/repo/n.ipynb',
    target: '/repo/n.ipynb',
    checkout: null,
    current: null,
  });
});

test('it builds no tool input for a tool that edits no file', () => {
  const action = buildMockEditAction({ toolName: 'Bash', target: '/repo/a' });

  expect(action).toStrictEqual({
    toolName: 'Bash',
    toolInput: {},
    requested: '/repo/a',
    target: '/repo/a',
    checkout: null,
    current: null,
  });
});
