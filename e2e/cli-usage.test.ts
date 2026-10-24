import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import * as z from 'zod';

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

  const directory = await realpath(created);

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
  auto-mode mod-path         Print the directory of the Claude Code mod this package ships
  auto-mode judge-server <socket>  Serve one agent session's judge reviews on a unix socket

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
  auto-mode mod-path         Print the directory of the Claude Code mod this package ships
  auto-mode judge-server <socket>  Serve one agent session's judge reviews on a unix socket

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

test.each([
  ['an unknown flag', ['run', '--frobnicate'], 'Unknown option: --frobnicate'],
  [
    'an evaluation deadline with no value',
    ['run', '--jev-only', '--evaluation-deadline'],
    "Optional argument '--evaluation-deadline' requires a value",
  ],
])('it exits 2 under node with usage and no stack trace on %s', async (_label, argv, message) => {
  const ctx = await setupTest();
  const result = await Bun.$`${ctx.node} ${ctx.cli} ${argv}`.env(ctx.env).quiet().nothrow();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: `auto-mode: ${message}

auto-mode — a permission classifier for the auto-mode Claude Code mod

Usage:
  auto-mode run              Read an action request on stdin, write a verdict on stdout
  auto-mode print-prompt     Print the system prompt the classifier receives
  auto-mode record           Read a finished Bash call on stdin, add what it created to the session's scope
  auto-mode mod-path         Print the directory of the Claude Code mod this package ships
  auto-mode judge-server <socket>  Serve one agent session's judge reviews on a unix socket

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
