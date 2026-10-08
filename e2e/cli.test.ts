import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { buildMockModRequest } from '../test-utils/factories/build-mock-mod-request.ts';
import { readFixture } from '../test-utils/read-fixture.ts';
import { runGit } from '../test-utils/run-git.ts';

// The child gets PATH and every other path from the temp root, never the host's
// environment. It gets no API key, so no run can reach a model.
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
    env: {
      PATH: process.env['PATH'],
      HOME: dir,
      XDG_CONFIG_HOME: dir,
      XDG_STATE_HOME: dir,
      AUTO_MODE_DIAGNOSTICS_PATH: join(dir, 'actions.jsonl'),
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

// Recorded from the mod in a live Claude Code session: Claude Code prompted for
// the deletion, and the local tier allows regenerable build output. The
// recording's cwd moves into the temp root.
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

// Writing nothing leaves the mod to keep the prompt Claude Code was about to show.
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

// The mod reads a non-zero exit as a failure, so input the CLI cannot read
// still exits 0.
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

// The policy files ship in the package and are the product, so a broken splice
// is a release blocker.
test('it assembles the shipped policy under node with the rules spliced in', async () => {
  const ctx = await setupTest();
  const result = await Bun.$`${ctx.node} ${ctx.cli} print-prompt`.env(ctx.env).quiet().nothrow();

  expect(result.exitCode).toBe(0);
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
