import { expect, test } from 'bun:test';
import { resolveSessionScopePath } from './resolve-session-scope-path.ts';

// The expected name is the first 32 hex digits of `printf session-1 | sha256sum`.
test('it names the file after the hash of the session ID inside the session-scope directory', () => {
  expect(resolveSessionScopePath('/state', 'session-1')).toBe(
    '/state/session-scope/84097828fc31a8c8d29210df48901a85.json',
  );
});

test('it gives the same session the same file', () => {
  expect(resolveSessionScopePath('/state', 'session-1')).toBe(
    resolveSessionScopePath('/state', 'session-1'),
  );
});

test('it gives another session another file', () => {
  expect(resolveSessionScopePath('/state', 'session-2')).not.toBe(
    resolveSessionScopePath('/state', 'session-1'),
  );
});
