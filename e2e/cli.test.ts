import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { buildMockModRequest } from '../test-utils/factories/build-mock-mod-request.ts';
import { readFixture } from '../test-utils/read-fixture.ts';
import { runGit } from '../test-utils/run-git.ts';

async function setupTest(): Promise<{
  readonly node: string;
  readonly root: string;
  readonly cli: string;
  readonly dir: string;
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
  const resolved = await Bun.$`node -p process.execPath`.quiet().text();

  return {
    node: resolved.trim(),
    root,
    cli,
    dir,
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

test('it resolves node 24 as the runtime the artifact runs under', async () => {
  const ctx = await setupTest();

  const result =
    await Bun.$`${ctx.node} -p ${"process.release.name + ' ' + process.versions.node.split('.')[0]"}`
      .env(ctx.env)
      .quiet()
      .nothrow();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: 'node 24\n', stderr: '' });
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

test('it assembles the shipped policy under node with the rules spliced in', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`${ctx.node} ${ctx.cli} print-prompt`.env(ctx.env).quiet().nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toBe('');
  expect(result.stdout.toString()).toMatch(/^## HARD BLOCK rules$/m);
  expect(result.stdout.toString()).toMatch(/^## ALLOW exceptions$/m);
  expect(result.stdout.toString()).not.toMatch(/^<rules>$/m);
});

test('it keeps a fail-closed denial under node when the safer-path guidance is missing', async () => {
  const ctx = await setupTest();

  const copy = join(ctx.dir, 'package');

  await cp(join(ctx.root, 'dist'), join(copy, 'dist'), { recursive: true });
  await cp(join(ctx.root, 'policy'), join(copy, 'policy'), { recursive: true });
  await rm(join(copy, 'policy', 'denial.md'));
  await mkdir(join(ctx.dir, 'auto-mode'));

  await writeFile(
    join(ctx.dir, 'auto-mode', 'config.json'),
    JSON.stringify({
      decision: { onFailure: 'deny', denialBudget: { consecutive: 3, perSession: 20 } },
    }),
  );

  await writeFile(join(ctx.dir, 'settings.json'), 'not json {');

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
