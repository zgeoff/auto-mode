import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';

async function setupTest(): Promise<{
  readonly node: string;
  readonly cli: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}> {
  const root = join(import.meta.dirname, '..');
  const cli = join(root, 'dist', 'cli.js');

  invariant(existsSync(cli), `${cli} is missing: run \`bun run build\` before this suite`);

  const created = await mkdtemp(join(tmpdir(), 'auto-mode-e2e-cli-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const dir = await realpath(created);

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

test('it prints usage under node when asked for help', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`${ctx.node} ${ctx.cli} --help`.env(ctx.env).quiet().nothrow();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: `auto-mode — a permission classifier for the auto-mode Claude Code mod

Usage:
  auto-mode run              Read an action request on stdin, write a verdict on stdout
  auto-mode print-prompt     Print the system prompt the classifier receives
  auto-mode record           Read a finished Bash call on stdin, add what it created to the session's scope

Options:
  --classifier <path>   Use this framework file instead of the shipped one
  --rules <path>        Use this rule list instead of the shipped one
  --explain             With run: also write the reasoning to stderr
  --local-only          With run: skip the model tier
  --jev-only            With run: require Jev and cap its API timeout at 5 seconds
  --evaluation-deadline <unix-ms>  With --jev-only: share the helper and API deadline
`,
    stderr: '',
  });
});

test('it exits 2 under node on a command it does not know', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`${ctx.node} ${ctx.cli} frobnicate`.env(ctx.env).quiet().nothrow();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: `auto-mode: unknown command 'frobnicate'

auto-mode — a permission classifier for the auto-mode Claude Code mod

Usage:
  auto-mode run              Read an action request on stdin, write a verdict on stdout
  auto-mode print-prompt     Print the system prompt the classifier receives
  auto-mode record           Read a finished Bash call on stdin, add what it created to the session's scope

Options:
  --classifier <path>   Use this framework file instead of the shipped one
  --rules <path>        Use this rule list instead of the shipped one
  --explain             With run: also write the reasoning to stderr
  --local-only          With run: skip the model tier
  --jev-only            With run: require Jev and cap its API timeout at 5 seconds
  --evaluation-deadline <unix-ms>  With --jev-only: share the helper and API deadline
`,
  });
});
