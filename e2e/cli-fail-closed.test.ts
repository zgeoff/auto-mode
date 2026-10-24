import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { buildMockModRequest } from '../test-utils/factories/build-mock-mod-request.ts';
import { runGit } from '../test-utils/run-git.ts';

async function setupTest(): Promise<{
  readonly node: string;
  readonly root: string;
  readonly directory: string;
  readonly repo: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}> {
  const root = join(import.meta.dirname, '..');
  const cli = join(root, 'dist', 'cli.js');

  invariant(existsSync(cli), `${cli} is missing: run \`bun run build\` before this suite`);

  const created = await mkdtemp(join(tmpdir(), 'auto-mode-e2e-cli-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const directory = await realpath(created);

  const repo = join(directory, 'repo');

  // The host may hold a .git above the temp root, which a walk up from the cwd
  // would otherwise reach.
  runGit(directory, ['init', '-q', '-b', 'main', repo]);

  // A version manager's node shim reads its config under the user's HOME, which
  // the child does not get, so the child runs the binary the shim resolves to.
  const resolved: unknown =
    await Bun.$`node -p ${'JSON.stringify({ node: process.execPath, version: process.versions.node })'}`
      .quiet()
      .json();

  const runtime = z.object({ node: z.string(), version: z.string() }).parse(resolved);

  invariant(
    runtime.version.startsWith('24.'),
    `node 24 runs this suite, not node ${runtime.version}`,
  );

  return {
    node: runtime.node,
    root,
    directory,
    repo,

    env: {
      PATH: process.env['PATH'],

      HOME: directory,

      XDG_CONFIG_HOME: directory,

      XDG_STATE_HOME: directory,

      AUTO_MODE_DIAGNOSTICS_PATH: join(directory, 'actions.jsonl'),

      CLAUDE_CONFIG_DIR: directory,
    },
  };
}

test('it keeps a fail-closed denial under node when the safer-path guidance is missing', async () => {
  const ctx = await setupTest();

  const copy = join(ctx.directory, 'package');

  await cp(join(ctx.root, 'dist'), join(copy, 'dist'), { recursive: true });
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

  const result =
    await Bun.$`${ctx.node} ${join(copy, 'dist', 'cli.js')} run < ${Response.json(payload)}`
      .env(ctx.env)
      .quiet()
      .nothrow();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: JSON.stringify({
      decision: 'deny',
      reason:
        '[Classifier Unavailable] Claude settings unreadable. Denials left before auto-mode asks the user: 2.',
    }),
    stderr: 'auto-mode: Claude settings unreadable; classifier unavailable\n',
  });
});
