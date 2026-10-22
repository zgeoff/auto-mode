import { expect, test } from 'bun:test';
import { parseGitBoolean } from './parse-git-boolean.ts';

test.each([
  ['1', true],
  ['TRUE', true],
  ['yes', true],
  ['on', true],
  ['7', true],
  ['0', false],
  ['false', false],
  ['No', false],
  ['off', false],
  ['', false],
  ['maybe', null],
])('it reads %p as %p', (value, expected) => {
  expect(parseGitBoolean(value)).toBe(expected);
});
