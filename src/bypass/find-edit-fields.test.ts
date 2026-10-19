import { expect, test } from 'bun:test';
import { findEditFields } from './find-edit-fields.ts';

test.each([
  ['Edit', { path: 'file_path', content: 'new_string' }],
  ['Write', { path: 'file_path', content: 'content' }],
  ['NotebookEdit', { path: 'notebook_path', content: 'new_source' }],
])('it names the path and content fields of a %s', (toolName, expected) => {
  expect(findEditFields(toolName)).toStrictEqual(expected);
});

test.each([['Bash'], ['MultiEdit'], ['edit']])(
  'it names no fields for %s, which is not a file-tool edit',
  (toolName) => {
    expect(findEditFields(toolName)).toBeNull();
  },
);
