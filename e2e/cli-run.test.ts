import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run } from '@zgeoff/testing/process';
import { buildIsolatedEnv } from '../src/test-utils/build-isolated-env.ts';
import { buildNodeCommand } from '../src/test-utils/build-node-command.ts';
import { readFixture } from '../src/test-utils/read-fixture.ts';
import { readNodePath } from '../src/test-utils/read-node-path.ts';
import { runGit } from '../src/test-utils/run-git.ts';

async function setupTest() {
  const program = await resolveProgram('auto-mode');
  const node = await readNodePath();
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-e2e-cli-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const directory = await realpath(created);

  const repo = join(directory, 'repo');

  // The host may hold a .git above the temp root, which a walk up from the cwd
  // would otherwise reach.
  runGit(directory, ['init', '-q', '-b', 'main', repo]);

  return {
    command: buildNodeCommand(program, node),
    cwd: program.cwd,
    repo,
    env: buildIsolatedEnv(process.env, {
      PATH: process.env['PATH'],
      HOME: directory,
      XDG_CONFIG_HOME: directory,
      XDG_STATE_HOME: directory,
      AUTO_MODE_DIAGNOSTICS_PATH: join(directory, 'actions.jsonl'),
      CLAUDE_CONFIG_DIR: directory,
    }),
  };
}

test('it allows a recorded mod request for regenerable output under node', async () => {
  const ctx = await setupTest();

  // The recording's cwd is /repo, which may exist on the host, so the test moves it
  // into the temp root.
  const payload = { ...readFixture('mod-request-regenerable'), cwd: ctx.repo };

  const result = await run(ctx.command, {
    args: ['run', '--local-only'],
    cwd: ctx.cwd,
    env: ctx.env,
    input: JSON.stringify(payload),
  });

  expect(result).toStrictEqual({ exitCode: 0, stdout: '{"decision":"allow"}', stderr: '' });
});

test('it writes nothing under node for a recorded mod request the local tier will not judge', async () => {
  const ctx = await setupTest();

  const payload = { ...readFixture('mod-request-write'), cwd: ctx.repo };

  const result = await run(ctx.command, {
    args: ['run', '--local-only'],
    cwd: ctx.cwd,
    env: ctx.env,
    input: JSON.stringify(payload),
  });

  expect(result).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});

test('it writes nothing and exits 0 under node on stdin that is not JSON', async () => {
  const ctx = await setupTest();

  const result = await run(ctx.command, {
    args: ['run'],
    cwd: ctx.cwd,
    env: ctx.env,
    input: 'not json',
  });

  expect(result).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});
