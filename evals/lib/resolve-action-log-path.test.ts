import { expect, test } from 'bun:test';
import { resolveActionLogPath } from './resolve-action-log-path.ts';

test('it reads the log the diagnostics path names', () => {
  expect(
    resolveActionLogPath(
      { AUTO_MODE_DIAGNOSTICS_PATH: '/logs/actions.jsonl', XDG_STATE_HOME: '/state' },
      '/home/user',
    ),
  ).toBe('/logs/actions.jsonl');
});

test('it reads the log under the XDG state directory when no diagnostics path is set', () => {
  expect(resolveActionLogPath({ XDG_STATE_HOME: '/state' }, '/home/user')).toBe(
    '/state/auto-mode/actions.jsonl',
  );
});

test('it reads the log under the home state directory without XDG_STATE_HOME', () => {
  expect(resolveActionLogPath({}, '/home/user')).toBe(
    '/home/user/.local/state/auto-mode/actions.jsonl',
  );
});

test('it refuses an empty diagnostics path, which disables the log', () => {
  expect(() => resolveActionLogPath({ AUTO_MODE_DIAGNOSTICS_PATH: '' }, '/home/user')).toThrow(
    'AUTO_MODE_DIAGNOSTICS_PATH is empty, so no action log is written; pass --log.',
  );
});
