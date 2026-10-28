import { expect, test } from 'bun:test';
import { buildStubProgram } from '../test-utils/build-stub-program.ts';
import { runPublishCheck } from './run-publish-check.ts';

test('it dispatches a run at a release tagged after the checked-out commit', () => {
  const program = buildStubProgram({
    'git rev-parse HEAD': [{ exitCode: 0, stdout: 'beef01\n', stderr: '' }],
    'npm view widget versions dist-tags --json': [
      {
        exitCode: 0,
        stdout: '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}',
        stderr: '',
      },
    ],
    'git ls-remote --tags origin refs/tags/widget-v*': [
      {
        exitCode: 0,
        stdout: 'a0a0a0\trefs/tags/widget-v2.3.0\nc0ffee\trefs/tags/widget-v2.4.0\n',
        stderr: '',
      },
    ],
    'gh workflow run main.yml --repo octo/widget --ref widget-v2.4.0 -f republish=true': [
      { exitCode: 0, stdout: '', stderr: '' },
    ],
  });

  const action = runPublishCheck({
    name: 'widget',
    repository: 'octo/widget',
    canPublishHere: false,
    cwd: '/repo',
    env: {},
    runProgram: program,
  });

  expect(action).toStrictEqual({
    kind: 'dispatch',
    tag: 'widget-v2.4.0',
    reason:
      'widget@2.4.0 is the oldest release missing from npm, so a run at widget-v2.4.0 (c0ffee) publishes it',
  });

  expect(program).toHaveBeenCalledWith(
    [
      'gh',
      'workflow',
      'run',
      'main.yml',
      '--repo',
      'octo/widget',
      '--ref',
      'widget-v2.4.0',
      '-f',
      'republish=true',
    ],
    { cwd: '/repo', env: {} },
  );
});

test('it fails the dispatch that gh refuses', () => {
  const program = buildStubProgram({
    'git rev-parse HEAD': [{ exitCode: 0, stdout: 'beef01\n', stderr: '' }],
    'npm view widget versions dist-tags --json': [
      {
        exitCode: 0,
        stdout: '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}',
        stderr: '',
      },
    ],
    'git ls-remote --tags origin refs/tags/widget-v*': [
      { exitCode: 0, stdout: 'c0ffee\trefs/tags/widget-v2.4.0\n', stderr: '' },
    ],
    'gh workflow run main.yml --repo octo/widget --ref widget-v2.4.0 -f republish=true': [
      { exitCode: 1, stdout: '', stderr: 'HTTP 403: Resource not accessible by integration' },
    ],
  });

  const action = runPublishCheck({
    name: 'widget',
    repository: 'octo/widget',
    canPublishHere: false,
    cwd: '/repo',
    env: {},
    runProgram: program,
  });

  expect(action).toStrictEqual({
    kind: 'fail',
    reason:
      'gh workflow run at widget-v2.4.0 failed: HTTP 403: Resource not accessible by integration',
  });
});

test('it throws when git cannot read the checked-out commit', () => {
  expect(() =>
    runPublishCheck({
      name: 'widget',
      repository: 'octo/widget',
      canPublishHere: true,
      cwd: '/repo',
      env: {},
      runProgram: buildStubProgram({
        'git rev-parse HEAD': [
          { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' },
        ],
      }),
    }),
  ).toThrowWithMessage(Error, 'git rev-parse HEAD failed: fatal: not a git repository');
});
