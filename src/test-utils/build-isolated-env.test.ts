import { expect, test } from 'bun:test';
import { buildIsolatedEnv } from './build-isolated-env.ts';

test('it unsets each host variable the test does not keep and keeps the rest', () => {
  const env = buildIsolatedEnv(
    { PATH: '/usr/bin', HOME: '/home/someone', SECRET_TOKEN: 'invented' },
    { PATH: '/usr/bin', HOME: '/tmp/home' },
  );

  expect(env).toStrictEqual({
    PATH: '/usr/bin',
    HOME: '/tmp/home',
    SECRET_TOKEN: undefined,
  });
});

test('it adds a variable the host lacks', () => {
  const env = buildIsolatedEnv(
    { PATH: '/usr/bin' },
    { PATH: '/usr/bin', CLAUDE_CONFIG_DIR: '/tmp/c' },
  );

  expect(env).toStrictEqual({ PATH: '/usr/bin', CLAUDE_CONFIG_DIR: '/tmp/c' });
});
