import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run } from '@zgeoff/testing/process';
import { buildIsolatedEnv } from '../src/test-utils/build-isolated-env.ts';
import { buildMockModRequest } from '../src/test-utils/factories/build-mock-mod-request.ts';
import { getProgramArtifact } from '../src/test-utils/get-program-artifact.ts';
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

  const artifact = relative(program.cwd, getProgramArtifact(program));

  return {
    node,
    root: program.cwd,
    artifact,
    directory,
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

test('it keeps a fail-closed denial under node when the safer-path guidance is missing', async () => {
  const ctx = await setupTest();

  const copy = join(ctx.directory, 'package');

  await cp(join(ctx.root, dirname(ctx.artifact)), join(copy, dirname(ctx.artifact)), {
    recursive: true,
  });

  await cp(join(ctx.root, 'policy'), join(copy, 'policy'), { recursive: true });
  await rm(join(copy, 'policy', 'denial.md'));
  await mkdir(join(ctx.directory, 'auto-mode'));

  await writeFile(
    join(ctx.directory, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 3, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.directory, 'settings.json'), 'not json {');

  const payload = buildMockModRequest({
    cwd: ctx.repo,
    toolName: 'Read',
    toolInput: { file_path: join(ctx.repo, 'file.ts') },
  });

  const result = await run([ctx.node, join(copy, ctx.artifact)], {
    args: ['run'],
    cwd: ctx.root,
    env: ctx.env,
    input: JSON.stringify(payload),
  });

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Denials left before auto-mode asks the user: 2.',
    }),
    stderr: 'auto-mode: Claude settings unreadable; classifier unavailable\n',
  });
});
