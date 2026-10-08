import { expect, onTestFinished, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { buildMockModRequest } from '../test-utils/factories/build-mock-mod-request.ts';
import { runGit } from '../test-utils/run-git.ts';

async function setupTest() {
  const cli = join(import.meta.dirname, '..', 'dist', 'cli.js');

  invariant(existsSync(cli), `${cli} is missing: run \`bun run build\` before this suite`);

  const created = await mkdtemp(join(tmpdir(), 'auto-mode-cli-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const dir = await realpath(created);

  const repo = join(dir, 'repo');

  // The checkout search walks up from the cwd and would stop at any .git
  // above the temp root, so the repo is a checkout of its own.
  runGit(dir, ['init', '-q', '-b', 'main', repo]);

  // A version manager's node shim reads its config under the user's HOME, which
  // the child does not get, so the child runs the binary the shim resolves to.
  const resolved: unknown =
    await Bun.$`node -p ${'JSON.stringify({ node: process.execPath, version: process.versions.node })'}`
      .quiet()
      .json();

  const runtime = z.object({ node: z.string(), version: z.string() }).parse(resolved);

  // The published artifact claims node 24 as the oldest node it supports.
  invariant(
    runtime.version.startsWith('24.'),
    `node 24 runs this suite, not node ${runtime.version}`,
  );

  // The child sends its decision request from outside this process, where the
  // mock server cannot answer it, so a real listener receives it and never replies.
  const arrived = Promise.withResolvers<undefined>();

  const decisionServer = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => {
      arrived.resolve(undefined);

      return new Promise<Response>(() => {});
    },
  });

  onTestFinished(() => decisionServer.stop(true));

  return {
    node: runtime.node,
    cli,
    dir,
    repo,
    decisionURL: decisionServer.url.origin,
    arrived: arrived.promise,
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

      // the CLI sends no Jev request without a key; the request reaches only the local listener
      TYPESAFE_API_KEY: 'cli-test-key',
    },
  };
}

test.each([['SIGTERM'], ['SIGINT']] as const)(
  'it cancels a Jev-only evaluation when %s arrives during it',
  async (signal) => {
    const ctx = await setupTest();

    await mkdir(join(ctx.dir, 'auto-mode'));

    await writeFile(
      join(ctx.dir, 'auto-mode', 'config.json'),
      JSON.stringify({
        classifiers: { jev: { baseURL: ctx.decisionURL } },
        decision: { classifier: 'jev', onFailure: 'deny' },
      }),
    );

    const child = spawn(ctx.node, [ctx.cli, 'run', '--jev-only'], {
      cwd: ctx.repo,
      env: ctx.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    onTestFinished(() => child.kill('SIGKILL'));

    const stdout = text(child.stdout);
    const stderr = text(child.stderr);
    const closed = once(child, 'close');

    child.stdin.end(
      JSON.stringify(
        buildMockModRequest({
          cwd: ctx.repo,
          toolName: 'Bash',
          toolInput: { command: 'make deploy' },
        }),
      ),
    );

    await ctx.arrived;

    child.kill(signal);

    await closed;

    const output = await stdout;
    const errors = await stderr;

    expect({ exitCode: child.exitCode, stdout: output, stderr: errors }).toStrictEqual({
      exitCode: 0,
      stdout: JSON.stringify({
        decision: 'deny',
        reason:
          '[Classifier Unavailable] jev-1.13.0 unavailable: evaluation cancelled. Do not retry this action, and do not reach the same result another way: not with a different command, tool, script, file, or agent. Continue the task on a safer path that does not need this action. If no safer path exists for this step, finish the rest of the task first, then tell the user what you need from them for this step. Denials left before auto-mode asks the user: 2.',
      }),
      stderr: 'auto-mode: jev-1.13.0 unavailable: evaluation cancelled\n',
    });
  },
);
