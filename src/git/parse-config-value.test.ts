import { expect, test } from 'bun:test';
import { parseConfigValue } from './parse-config-value.ts';

test.each([
  [' .githooks ', '.githooks'],
  ['"/srv/hooks # kept" # comment', '/srv/hooks # kept'],
  ['hooks ; comment', 'hooks'],
  [String.raw`"a\"b\\c"`, String.raw`a"b\c`],
  [String.raw`line\tbreak`, 'line\tbreak'],
])('it reads the raw value %p as %p', (raw, expected) => {
  expect(parseConfigValue(raw)).toBe(expected);
});
