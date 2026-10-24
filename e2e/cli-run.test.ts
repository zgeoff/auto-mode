import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { readFixture } from '../test-utils/read-fixture.ts';
import { runGit } from '../test-utils/run-git.ts';

async function setupTest(): Promise<{
  readonly node: string;
  readonly cli: string;
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
    cli,
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

test('it allows a recorded mod request for regenerable output under node', async () => {
  const ctx = await setupTest();

  // The recording's cwd is /repo, which may exist on the host, so the test moves it
  // into the temp root.
  const payload = { ...readFixture('mod-request-regenerable'), cwd: ctx.repo };

  const result = await Bun.$`${ctx.node} ${ctx.cli} run --local-only < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '{"decision":"allow"}', stderr: '' });
});

test('it writes nothing under node for a recorded mod request the local tier will not judge', async () => {
  const ctx = await setupTest();

  const payload = { ...readFixture('mod-request-write'), cwd: ctx.repo };

  const result = await Bun.$`${ctx.node} ${ctx.cli} run --local-only < ${Response.json(payload)}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});

test('it writes nothing and exits 0 under node on stdin that is not JSON', async () => {
  const ctx = await setupTest();

  const result = await Bun.$`${ctx.node} ${ctx.cli} run < ${new Response('not json')}`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});
