import { expect, test } from 'bun:test';
import { isLocalHookConfig } from './is-local-hook-config.ts';

test.each([
  'lefthook-local.yml',
  '/repo/lefthook-local.yaml',
  '/repo/.lefthook-local.yml',
  '/repo/lefthook-local.json',
  '/repo/lefthook-local.jsonc',
  '/repo/lefthook-local.toml',
])('it reads %s as a local lefthook config', (path) => {
  expect(isLocalHookConfig(path)).toBeTrue();
});

test.each([
  '/repo/lefthook.yml',
  '/repo/lefthook-local.yml.bak',
  '/repo/my-lefthook-local.yml',
  '/repo/lefthook-local.md',
])('it reads %s as another file', (path) => {
  expect(isLocalHookConfig(path)).toBeFalse();
});
