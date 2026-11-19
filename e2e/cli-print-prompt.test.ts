import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run } from '@zgeoff/testing/process';
import { loadPolicy } from '../src/policy/load-policy.ts';
import { buildIsolatedEnv } from '../src/test-utils/build-isolated-env.ts';
import { buildNodeCommand } from '../src/test-utils/build-node-command.ts';
import { readNodePath } from '../src/test-utils/read-node-path.ts';

async function setupTest() {
  const program = await resolveProgram('auto-mode');
  const node = await readNodePath();
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-e2e-cli-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const directory = await realpath(created);

  return {
    command: buildNodeCommand(program, node),
    cwd: program.cwd,

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

test('it prints the shipped Jev framework under node with the shipped rules in place of the marker', async () => {
  const ctx = await setupTest();
  const policy = await loadPolicy({}, 'decision.md');
  const result = await run(ctx.command, { args: ['print-prompt'], cwd: ctx.cwd, env: ctx.env });

  expect(result).toStrictEqual({ exitCode: 0, stdout: `${policy}\n`, stderr: '' });
});
