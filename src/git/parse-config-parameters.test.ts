import { expect, test } from 'bun:test';
import { parseConfigParameters } from './parse-config-parameters.ts';

test('it reads each parameter in order, in both of the forms git writes', () => {
  expect(
    parseConfigParameters(
      String.raw`'core.hooksPath'='/srv/checks' 'user.name=robin'  'core.bare' 'core.hooksPath'='it'\''s'`,
    ),
  ).toStrictEqual([
    { key: 'core.hooksPath', value: '/srv/checks' },
    { key: 'user.name', value: 'robin' },
    { key: 'core.bare', value: null },
    { key: 'core.hooksPath', value: "it's" },
  ]);
});

test('it reads an empty variable as no parameters', () => {
  expect(parseConfigParameters('')).toStrictEqual([]);
});

test('it reads a key with an empty value', () => {
  expect(parseConfigParameters("'core.hooksPath='")).toStrictEqual([
    { key: 'core.hooksPath', value: '' },
  ]);
});

test.each([
  ['an unquoted word', 'core.hooksPath=/srv/checks'],
  ['an unclosed quote', "'core.hooksPath=/srv/checks"],
  ['an unquoted value', "'core.hooksPath'=/srv/checks"],
  ['two words with no space between', "'core.bare''user.name=robin'"],
])('it refuses %s', (_, text) => {
  expect(parseConfigParameters(text)).toBeNull();
});
