import { expect, test } from 'bun:test';
import { pickPublishAction } from './pick-publish-action.ts';

test('it publishes the oldest pending tag when it is the commit of a run that can publish', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      head: 'c0ffee',
      canPublishHere: true,
      registry: {
        exitCode: 0,
        stdout: '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}',
        stderr: '',
      },
      tagListing: {
        exitCode: 0,
        stdout: 'a0a0a0\trefs/tags/widget-v2.3.0\nc0ffee\trefs/tags/widget-v2.4.0\n',
        stderr: '',
      },
    }),
  ).toStrictEqual({
    kind: 'publish',
    tag: 'widget-v2.4.0',
    reason:
      "widget@2.4.0 is the oldest release missing from npm, and widget-v2.4.0 is this run's commit",
  });
});

test('it dispatches a run at the oldest pending tag when its commit is not the checkout', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      head: 'beef01',
      canPublishHere: true,
      registry: {
        exitCode: 0,
        stdout: '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}',
        stderr: '',
      },
      tagListing: { exitCode: 0, stdout: 'c0ffee\trefs/tags/widget-v2.4.0\n', stderr: '' },
    }),
  ).toStrictEqual({
    kind: 'dispatch',
    tag: 'widget-v2.4.0',
    reason:
      'widget@2.4.0 is the oldest release missing from npm, so a run at widget-v2.4.0 (c0ffee) publishes it',
  });
});

test('it dispatches a run at the tag from a run that cannot publish, even at the tagged commit', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      head: 'c0ffee',
      canPublishHere: false,
      registry: {
        exitCode: 0,
        stdout: '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}',
        stderr: '',
      },
      tagListing: { exitCode: 0, stdout: 'c0ffee\trefs/tags/widget-v2.4.0\n', stderr: '' },
    }),
  ).toStrictEqual({
    kind: 'dispatch',
    tag: 'widget-v2.4.0',
    reason:
      'widget@2.4.0 is the oldest release missing from npm, so a run at widget-v2.4.0 (c0ffee) publishes it',
  });
});

test('it hands a run at a newer pending tag to the older pending tag, so latest never moves back', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      head: 'd00d00',
      canPublishHere: true,
      registry: {
        exitCode: 0,
        stdout: '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}',
        stderr: '',
      },
      tagListing: {
        exitCode: 0,
        stdout: 'd00d00\trefs/tags/widget-v2.10.0\nc0ffee\trefs/tags/widget-v2.4.0\n',
        stderr: '',
      },
    }),
  ).toStrictEqual({
    kind: 'dispatch',
    tag: 'widget-v2.4.0',
    reason:
      'widget@2.4.0 is the oldest release missing from npm, so a run at widget-v2.4.0 (c0ffee) publishes it',
  });
});

test('it leaves a tag older than latest that never reached npm', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      head: 'c0ffee',
      canPublishHere: true,
      registry: {
        exitCode: 0,
        stdout: '{"versions":["2.3.0","2.5.0"],"dist-tags":{"latest":"2.5.0"}}',
        stderr: '',
      },
      tagListing: {
        exitCode: 0,
        stdout: 'c0ffee\trefs/tags/widget-v2.4.0\na0a0a0\trefs/tags/widget-v2.5.0\n',
        stderr: '',
      },
    }),
  ).toStrictEqual({
    kind: 'skip',
    reason: 'no widget release tag newer than 2.5.0 is missing from npm',
  });
});

test('it reads the commit of an annotated tag from its peeled ref', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      head: 'c0ffee',
      canPublishHere: true,
      registry: {
        exitCode: 0,
        stdout: '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}',
        stderr: '',
      },
      tagListing: {
        exitCode: 0,
        stdout: 'a11a11\trefs/tags/widget-v2.4.0\nc0ffee\trefs/tags/widget-v2.4.0^{}\n',
        stderr: '',
      },
    }),
  ).toStrictEqual({
    kind: 'publish',
    tag: 'widget-v2.4.0',
    reason:
      "widget@2.4.0 is the oldest release missing from npm, and widget-v2.4.0 is this run's commit",
  });
});

test('it ignores a tag of another package or with a version that is not a release', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      head: 'c0ffee',
      canPublishHere: true,
      registry: {
        exitCode: 0,
        stdout: '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}',
        stderr: '',
      },
      tagListing: {
        exitCode: 0,
        stdout: 'c0ffee\trefs/tags/widget-v2.4.0-rc.1\nc0ffee\trefs/tags/gadget-v9.0.0\n',
        stderr: '',
      },
    }),
  ).toStrictEqual({
    kind: 'skip',
    reason: 'no widget release tag newer than 2.3.0 is missing from npm',
  });
});

test('it fails when npm cannot reach the registry', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      head: 'c0ffee',
      canPublishHere: true,
      registry: {
        exitCode: 1,
        stdout: '{"error":{"code":"ECONNREFUSED"}}',
        stderr: 'npm error code ECONNREFUSED',
      },
      tagListing: { exitCode: 0, stdout: 'c0ffee\trefs/tags/widget-v2.4.0\n', stderr: '' },
    }),
  ).toStrictEqual({
    kind: 'fail',
    reason:
      'npm view widget failed: exit 1: npm error code ECONNREFUSED\n{"error":{"code":"ECONNREFUSED"}}',
  });
});

test('it fails when npm answers without a latest version', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      head: 'c0ffee',
      canPublishHere: true,
      registry: { exitCode: 0, stdout: '{"versions":["2.3.0"],"dist-tags":{}}', stderr: '' },
      tagListing: { exitCode: 0, stdout: 'c0ffee\trefs/tags/widget-v2.4.0\n', stderr: '' },
    }),
  ).toStrictEqual({
    kind: 'fail',
    reason: 'npm view widget failed: exit 0: {"versions":["2.3.0"],"dist-tags":{}}',
  });
});

test('it fails when git cannot list the remote tags', () => {
  expect(
    pickPublishAction({
      name: 'widget',
      head: 'c0ffee',
      canPublishHere: true,
      registry: {
        exitCode: 0,
        stdout: '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}',
        stderr: '',
      },
      tagListing: {
        exitCode: 128,
        stdout: '',
        stderr: "fatal: 'origin' does not appear to be a git repository",
      },
    }),
  ).toStrictEqual({
    kind: 'fail',
    reason:
      "git ls-remote for widget tags failed: exit 128: fatal: 'origin' does not appear to be a git repository",
  });
});
