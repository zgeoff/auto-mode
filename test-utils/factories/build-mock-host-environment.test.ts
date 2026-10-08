import { expect, test } from 'bun:test';
import { buildMockHostEnvironment } from './build-mock-host-environment.ts';

test('it builds a default host environment', () => {
  expect(buildMockHostEnvironment()).toStrictEqual({
    env: {},
    home: expect.toStartWith('/nonexistent/'),
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockHostEnvironment({
      env: { XDG_STATE_HOME: '/work/state' },
      home: '/work/home',
      scratchPaths: [],
    }),
  ).toStrictEqual({ env: { XDG_STATE_HOME: '/work/state' }, home: '/work/home', scratchPaths: [] });
});
