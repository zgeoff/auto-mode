import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run } from '@zgeoff/testing/process';
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

test('it prints usage under node when asked for help', async () => {
  const ctx = await setupTest();
  const result = await run(ctx.command, { args: ['--help'], cwd: ctx.cwd, env: ctx.env });

  expect(result).toStrictEqual({
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
  const result = await run(ctx.command, { args: ['frobnicate'], cwd: ctx.cwd, env: ctx.env });

  expect(result).toStrictEqual({
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
  const result = await run(ctx.command, { args: argv, cwd: ctx.cwd, env: ctx.env });

  expect(result).toStrictEqual({
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
