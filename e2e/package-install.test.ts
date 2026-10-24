import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import invariant from 'tiny-invariant';
import * as z from 'zod';

async function setupTest(): Promise<{
  readonly node: string;
  readonly packageDir: string;
  readonly files: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
}> {
  const root = join(import.meta.dirname, '..');

  invariant(
    existsSync(join(root, 'dist', 'cli.js')),
    'dist/cli.js is missing: run `bun run build` before this suite',
  );

  const created = await mkdtemp(join(tmpdir(), 'auto-mode-e2e-pack-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const directory = await realpath(created);

  // A version manager's node shim reads its config under the user's HOME, which
  // the children do not get, so they run the binaries the shim resolves to.
  const resolved = await Bun.$`node -p process.execPath`.quiet().text();

  const node = resolved.trim();
  const nodeDirectory = dirname(node);

  // The package's prepare script links the evals package and installs git
  // hooks, which a pack of the built artifact does not need.
  const packed: unknown =
    await Bun.$`${join(nodeDirectory, 'npm')} pack --json --ignore-scripts --pack-destination ${directory}`
      .cwd(root)
      .env({
        PATH: `${nodeDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
        HOME: directory,
        npm_config_cache: join(directory, 'npm-cache'),
      })
      .quiet()
      .json();

  const packedFile = z.object({ path: z.string() });
  const packedTarball = z.object({ filename: z.string(), files: z.array(packedFile) });
  const [tarball] = z.array(packedTarball).length(1).parse(packed);

  invariant(tarball);

  await Bun.$`tar -xzf ${join(directory, tarball.filename)} -C ${directory}`.quiet();

  return {
    node,
    packageDir: join(directory, 'package'),
    files: tarball.files.map((file) => file.path),
    env: { PATH: process.env['PATH'], HOME: directory },
  };
}

test('it prints the mod directory of the installed package under node', async () => {
  const ctx = await setupTest();

  const result = await Bun.$`${ctx.node} ${join(ctx.packageDir, 'dist', 'cli.js')} mod-path`
    .env(ctx.env)
    .quiet()
    .nothrow();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: `${join(ctx.packageDir, 'mods', 'auto-mode')}\n`,
    stderr: '',
  });
});

test('it ships the mod and the secret rule set in the package', async () => {
  const ctx = await setupTest();

  expect(ctx.files).toIncludeAllMembers([
    'dist/secret-rules.json',
    'mods/auto-mode/.claude-plugin/plugin.json',
  ]);
});
