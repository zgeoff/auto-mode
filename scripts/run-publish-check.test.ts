import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubProgram } from '../test-utils/build-stub-program.ts';
import { runPublishCheck } from './run-publish-check.ts';

async function setupTest(): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'publish-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it dispatches a run at a release tagged after the checked-out commit', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ name: 'widget', version: '2.3.0' }),
  );

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

  const actions = runPublishCheck({
    cwd: ctx.directory,
    env: {},
    repository: 'octo/widget',
    canPublishHere: false,
    runProgram: program,
  });

  expect(actions).toStrictEqual([
    {
      kind: 'dispatch',
      tag: 'widget-v2.4.0',
      reason: 'widget@2.4.0 is missing from npm, so a run at widget-v2.4.0 (c0ffee) publishes it',
    },
  ]);

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
    { cwd: ctx.directory, env: {} },
  );
});

test('it publishes the release at its own tag when the run can publish', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ name: 'widget', version: '2.4.0' }),
  );

  const program = buildStubProgram({
    'git rev-parse HEAD': [{ exitCode: 0, stdout: 'c0ffee\n', stderr: '' }],
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
  });

  const actions = runPublishCheck({
    cwd: ctx.directory,
    env: {},
    repository: 'octo/widget',
    canPublishHere: true,
    runProgram: program,
  });

  expect(actions).toStrictEqual([
    {
      kind: 'publish',
      tag: 'widget-v2.4.0',
      reason: "widget@2.4.0 is missing from npm, and widget-v2.4.0 is this run's commit",
    },
  ]);
});

test('it fails the dispatch that gh refuses', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ name: 'widget', version: '2.4.0' }),
  );

  const program = buildStubProgram({
    'git rev-parse HEAD': [{ exitCode: 0, stdout: 'c0ffee\n', stderr: '' }],
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

  const actions = runPublishCheck({
    cwd: ctx.directory,
    env: {},
    repository: 'octo/widget',
    canPublishHere: false,
    runProgram: program,
  });

  expect(actions).toStrictEqual([
    {
      kind: 'fail',
      reason:
        'gh workflow run at widget-v2.4.0 failed: HTTP 403: Resource not accessible by integration',
    },
  ]);
});

test('it throws on a package.json that has no name', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'package.json'), JSON.stringify({ version: '2.4.0' }));

  expect(() =>
    runPublishCheck({
      cwd: ctx.directory,
      env: {},
      repository: 'octo/widget',
      canPublishHere: true,
      runProgram: buildStubProgram({}),
    }),
  ).toThrow();
});

test('it throws when git cannot read the checked-out commit', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ name: 'widget', version: '2.4.0' }),
  );

  expect(() =>
    runPublishCheck({
      cwd: ctx.directory,
      env: {},
      repository: 'octo/widget',
      canPublishHere: true,
      runProgram: buildStubProgram({
        'git rev-parse HEAD': [
          { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' },
        ],
      }),
    }),
  ).toThrowWithMessage(Error, 'git rev-parse HEAD failed: fatal: not a git repository');
});
