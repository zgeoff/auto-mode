import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
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

  const dir = await realpath(created);

  const repo = join(dir, 'repo');

  // The checkout search walks up from the cwd and would stop at any .git
  // above the temp root, so the repo is a checkout of its own.
  runGit(dir, ['init', '-q', '-b', 'main', repo]);

  // A version manager's node shim reads its config under the user's HOME, which
  // the child does not get, so the child runs the binary the shim resolves to.
  const resolved = await Bun.$`node -p ${"process.execPath + ' ' + process.versions.node"}`
    .quiet()
    .text();

  const [node, version] = resolved.trim().split(' ');

  invariant(node !== undefined, 'node reported its executable path');

  // The published artifact claims node 24 as the oldest node it supports.
  invariant(version?.startsWith('24.') === true, `node 24 runs this suite, not node ${version}`);

  return {
    node,
    cli,
    repo,

    // No API key reaches the child, so no run can reach a model.
    env: {
      // the CLI starts git for the task scope, which it finds through PATH
      PATH: process.env['PATH'],

      // the home the CLI falls back to for its config and state
      HOME: dir,

      // the CLI reads its config.json under this directory
      XDG_CONFIG_HOME: dir,

      // the CLI keeps its denial counts under this directory
      XDG_STATE_HOME: dir,

      // the CLI appends a diagnostic record per run to this file
      AUTO_MODE_DIAGNOSTICS_PATH: join(dir, 'actions.jsonl'),

      // the CLI reads Claude Code's settings.json under this directory
      CLAUDE_CONFIG_DIR: dir,
    },
  };
}

// The recording's cwd is /repo, which may exist on the host, so the test moves it
// into the temp root.
test('it allows a recorded mod request for regenerable output under node', async () => {
  const ctx = await setupTest();

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
