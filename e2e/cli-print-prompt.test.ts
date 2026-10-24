import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { loadPolicy } from '../src/policy/load-policy.ts';

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

test('it prints the shipped Jev framework under node with the shipped rules in place of the marker', async () => {
  const ctx = await setupTest();
  const policy = await loadPolicy({}, 'decision.md');
  const result = await Bun.$`${ctx.node} ${ctx.cli} print-prompt`.env(ctx.env).quiet().nothrow();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: `${policy}\n`, stderr: '' });
});
