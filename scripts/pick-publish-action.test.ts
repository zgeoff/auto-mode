import { expect, test } from 'bun:test';
import { pickPublishAction } from './pick-publish-action.ts';

test('it publishes a tagged version that npm answers E404 for', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      version: '2.4.0',
      tag: 'widget-v2.4.0',
      registry: {
        exitCode: 1,
        stdout: '{"error":{"code":"E404","summary":"No match found for version 2.4.0"}}',
        stderr: 'npm error code E404',
      },
      tagLookup: { exitCode: 0, stdout: 'f00d\trefs/tags/widget-v2.4.0\n', stderr: '' },
    }),
  ).toStrictEqual({
    kind: 'publish',
    reason: 'widget@2.4.0 is tagged widget-v2.4.0 and missing from npm',
  });
});

test('it skips a version npm already serves', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      version: '2.4.0',
      tag: 'widget-v2.4.0',
      registry: { exitCode: 0, stdout: '"2.4.0"\n', stderr: '' },
      tagLookup: { exitCode: 0, stdout: 'f00d\trefs/tags/widget-v2.4.0\n', stderr: '' },
    }),
  ).toStrictEqual({ kind: 'skip', reason: 'widget@2.4.0 is already on npm' });
});

test('it skips a version missing from npm that has no release tag', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      version: '2.4.0',
      tag: 'widget-v2.4.0',
      registry: { exitCode: 1, stdout: '{"error":{"code":"E404"}}', stderr: '' },
      tagLookup: { exitCode: 2, stdout: '', stderr: '' },
    }),
  ).toStrictEqual({
    kind: 'skip',
    reason: 'widget@2.4.0 is missing from npm, but no widget-v2.4.0 tag exists',
  });
});

test('it fails when npm cannot reach the registry', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      version: '2.4.0',
      tag: 'widget-v2.4.0',
      registry: {
        exitCode: 1,
        stdout: '{"error":{"code":"ECONNREFUSED"}}',
        stderr: 'npm error code ECONNREFUSED',
      },
      tagLookup: { exitCode: 0, stdout: 'f00d\trefs/tags/widget-v2.4.0\n', stderr: '' },
    }),
  ).toStrictEqual({
    kind: 'fail',
    reason:
      'npm view widget@2.4.0 failed: exit 1: npm error code ECONNREFUSED\n{"error":{"code":"ECONNREFUSED"}}',
  });
});

test('it fails when npm exits 0 with a version other than the one it was asked for', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      version: '2.4.0',
      tag: 'widget-v2.4.0',
      registry: { exitCode: 0, stdout: '', stderr: '' },
      tagLookup: { exitCode: 0, stdout: 'f00d\trefs/tags/widget-v2.4.0\n', stderr: '' },
    }),
  ).toStrictEqual({ kind: 'fail', reason: 'npm view widget@2.4.0 failed: exit 0' });
});

test('it fails when git cannot list the remote tags', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      version: '2.4.0',
      tag: 'widget-v2.4.0',
      registry: { exitCode: 1, stdout: '{"error":{"code":"E404"}}', stderr: '' },
      tagLookup: {
        exitCode: 128,
        stdout: '',
        stderr: "fatal: 'origin' does not appear to be a git repository",
      },
    }),
  ).toStrictEqual({
    kind: 'fail',
    reason:
      "git ls-remote for widget-v2.4.0 failed: exit 128: fatal: 'origin' does not appear to be a git repository",
  });
});
