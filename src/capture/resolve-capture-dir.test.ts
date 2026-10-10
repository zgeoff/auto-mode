import { expect, test } from 'bun:test';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import { resolveCaptureDir } from './resolve-capture-dir.ts';

test('it keeps captures under the auto-mode state directory when no dir is configured', () => {
  const host = buildMockHostEnvironment({ env: { XDG_STATE_HOME: '/state' }, home: '/home/u' });

  expect(resolveCaptureDir({ enabled: true }, host)).toBe('/state/auto-mode/captures');
});

test('it uses the configured dir when one is set', () => {
  const host = buildMockHostEnvironment({ env: { XDG_STATE_HOME: '/state' }, home: '/home/u' });

  expect(resolveCaptureDir({ enabled: true, dir: '/captures' }, host)).toBe('/captures');
});
