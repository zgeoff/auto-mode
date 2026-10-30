import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubProgram } from '../test-utils/build-stub-program.ts';
import { runGit } from '../test-utils/run-git.ts';
import { runPublishCheck } from './run-publish-check.ts';

async function setupTest(): Promise<{ readonly directory: string; readonly script: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'publish-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, script: join(import.meta.dirname, 'run-publish-check.ts') };
}

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

test('it writes publish=true and exits 0 at the tag of the oldest pending release as a script', async () => {
  const ctx = await setupTest();

  const origin = join(ctx.directory, 'origin.git');
  const work = join(ctx.directory, 'work');
  const bin = join(ctx.directory, 'bin');

  runGit(ctx.directory, ['init', '--quiet', '--bare', origin]);
  runGit(ctx.directory, ['init', '--quiet', work]);

  await writeFile(join(work, 'package.json'), '{"name":"widget","version":"2.4.0"}\n');

  runGit(work, ['add', 'package.json']);
  runGit(work, ['commit', '--quiet', '-m', 'chore: release 2.4.0']);
  runGit(work, ['tag', 'widget-v2.4.0']);
  runGit(work, ['remote', 'add', 'origin', origin]);
  runGit(work, ['push', '--quiet', 'origin', 'HEAD:main', '--tags']);

  await mkdir(bin);

  await writeFile(
    join(bin, 'npm'),
    `#!/bin/sh\nprintf '%s' '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}'\n`,
  );

  await writeFile(join(bin, 'gh'), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$GH_CALLS"\n');
  await chmod(join(bin, 'npm'), 0o755);
  await chmod(join(bin, 'gh'), 0o755);

  const result = await Bun.$`${process.execPath} ${ctx.script}`
    .cwd(work)
    .env({
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      HOME: ctx.directory,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GITHUB_OUTPUT: join(ctx.directory, 'output'),
      GITHUB_REPOSITORY: 'octo/widget',
      GH_CALLS: join(ctx.directory, 'gh-calls'),
      CAN_PUBLISH_HERE: 'true',
    })
    .quiet()
    .nothrow();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');
  const dispatched = await Bun.file(join(ctx.directory, 'gh-calls')).exists();

  expect(result.exitCode).toBe(0);
  expect(output).toBe('publish=true\n');
  expect(dispatched).toBe(false);
});

test('it dispatches from a run that cannot publish and writes publish=false as a script', async () => {
  const ctx = await setupTest();

  const origin = join(ctx.directory, 'origin.git');
  const work = join(ctx.directory, 'work');
  const bin = join(ctx.directory, 'bin');

  runGit(ctx.directory, ['init', '--quiet', '--bare', origin]);
  runGit(ctx.directory, ['init', '--quiet', work]);

  await writeFile(join(work, 'package.json'), '{"name":"widget","version":"2.4.0"}\n');

  runGit(work, ['add', 'package.json']);
  runGit(work, ['commit', '--quiet', '-m', 'chore: release 2.4.0']);
  runGit(work, ['tag', 'widget-v2.4.0']);
  runGit(work, ['remote', 'add', 'origin', origin]);
  runGit(work, ['push', '--quiet', 'origin', 'HEAD:main', '--tags']);

  await mkdir(bin);

  await writeFile(
    join(bin, 'npm'),
    `#!/bin/sh\nprintf '%s' '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}'\n`,
  );

  await writeFile(join(bin, 'gh'), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$GH_CALLS"\n');
  await chmod(join(bin, 'npm'), 0o755);
  await chmod(join(bin, 'gh'), 0o755);

  const result = await Bun.$`${process.execPath} ${ctx.script}`
    .cwd(work)
    .env({
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      HOME: ctx.directory,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GITHUB_OUTPUT: join(ctx.directory, 'output'),
      GITHUB_REPOSITORY: 'octo/widget',
      GH_CALLS: join(ctx.directory, 'gh-calls'),
      CAN_PUBLISH_HERE: 'false',
    })
    .quiet()
    .nothrow();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');
  const calls = await readFile(join(ctx.directory, 'gh-calls'), 'utf8');

  expect(result.exitCode).toBe(0);
  expect(output).toBe('publish=false\n');

  expect(calls).toBe(
    'workflow run main.yml --repo octo/widget --ref widget-v2.4.0 -f republish=true\n',
  );
});

test('it exits 1 and writes publish=false as a script when the dispatch fails', async () => {
  const ctx = await setupTest();

  const origin = join(ctx.directory, 'origin.git');
  const work = join(ctx.directory, 'work');
  const bin = join(ctx.directory, 'bin');

  runGit(ctx.directory, ['init', '--quiet', '--bare', origin]);
  runGit(ctx.directory, ['init', '--quiet', work]);

  await writeFile(join(work, 'package.json'), '{"name":"widget","version":"2.4.0"}\n');

  runGit(work, ['add', 'package.json']);
  runGit(work, ['commit', '--quiet', '-m', 'chore: release 2.4.0']);
  runGit(work, ['tag', 'widget-v2.4.0']);
  runGit(work, ['remote', 'add', 'origin', origin]);
  runGit(work, ['push', '--quiet', 'origin', 'HEAD:main', '--tags']);

  await mkdir(bin);

  await writeFile(
    join(bin, 'npm'),
    `#!/bin/sh\nprintf '%s' '{"versions":["2.3.0"],"dist-tags":{"latest":"2.3.0"}}'\n`,
  );

  await writeFile(
    join(bin, 'gh'),
    '#!/bin/sh\necho "HTTP 403: Resource not accessible by integration" >&2\nexit 1\n',
  );

  await chmod(join(bin, 'npm'), 0o755);
  await chmod(join(bin, 'gh'), 0o755);

  const result = await Bun.$`${process.execPath} ${ctx.script}`
    .cwd(work)
    .env({
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      HOME: ctx.directory,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GITHUB_OUTPUT: join(ctx.directory, 'output'),
      GITHUB_REPOSITORY: 'octo/widget',
      CAN_PUBLISH_HERE: 'false',
    })
    .quiet()
    .nothrow();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');

  expect(result.exitCode).toBe(1);
  expect(output).toBe('publish=false\n');

  expect(result.stderr.toString()).toBe(
    'publish check: gh workflow run at widget-v2.4.0 failed: HTTP 403: Resource not accessible by integration\n',
  );
});

test('it writes publish=false and exits 0 as a script when every release tag is on npm', async () => {
  const ctx = await setupTest();

  const origin = join(ctx.directory, 'origin.git');
  const work = join(ctx.directory, 'work');
  const bin = join(ctx.directory, 'bin');

  runGit(ctx.directory, ['init', '--quiet', '--bare', origin]);
  runGit(ctx.directory, ['init', '--quiet', work]);

  await writeFile(join(work, 'package.json'), '{"name":"widget","version":"2.4.0"}\n');

  runGit(work, ['add', 'package.json']);
  runGit(work, ['commit', '--quiet', '-m', 'chore: release 2.4.0']);
  runGit(work, ['tag', 'widget-v2.4.0']);
  runGit(work, ['remote', 'add', 'origin', origin]);
  runGit(work, ['push', '--quiet', 'origin', 'HEAD:main', '--tags']);

  await mkdir(bin);

  await writeFile(
    join(bin, 'npm'),
    `#!/bin/sh\nprintf '%s' '{"versions":["2.3.0","2.4.0"],"dist-tags":{"latest":"2.4.0"}}'\n`,
  );

  await writeFile(join(bin, 'gh'), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$GH_CALLS"\n');
  await chmod(join(bin, 'npm'), 0o755);
  await chmod(join(bin, 'gh'), 0o755);

  const result = await Bun.$`${process.execPath} ${ctx.script}`
    .cwd(work)
    .env({
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      HOME: ctx.directory,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GITHUB_OUTPUT: join(ctx.directory, 'output'),
      GITHUB_REPOSITORY: 'octo/widget',
      GH_CALLS: join(ctx.directory, 'gh-calls'),
      CAN_PUBLISH_HERE: 'true',
    })
    .quiet()
    .nothrow();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');
  const dispatched = await Bun.file(join(ctx.directory, 'gh-calls')).exists();

  expect(result.exitCode).toBe(0);
  expect(output).toBe('publish=false\n');
  expect(dispatched).toBe(false);

  expect(result.stdout.toString()).toBe(
    'publish check: no widget release tag newer than 2.4.0 is missing from npm\n',
  );
});

test('it exits 2 as a script when GITHUB_OUTPUT is not set', async () => {
  const ctx = await setupTest();

  const result = await Bun.$`${process.execPath} ${ctx.script}`
    .cwd(ctx.directory)
    .env({ PATH: process.env['PATH'], HOME: ctx.directory, GITHUB_REPOSITORY: 'octo/widget' })
    .quiet()
    .nothrow();

  expect(result.exitCode).toBe(2);

  expect(result.stderr.toString()).toBe(
    'publish check: GITHUB_OUTPUT and GITHUB_REPOSITORY must be set\n',
  );
});
