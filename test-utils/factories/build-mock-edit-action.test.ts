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
    toolName: 'Edit',
    toolInput: { file_path: 'a.ts', old_string: 'a', new_string: 'b' },
    requested: '/repo/link/a.ts',
    target: '/outside/a.ts',
    checkout: '/repo',
    current: 'a\n',
  });

  expect(action).toStrictEqual({
    toolName: 'Edit',
    toolInput: { file_path: 'a.ts', old_string: 'a', new_string: 'b' },
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
