import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run } from '@zgeoff/testing/process';
import * as z from 'zod';
import { buildIsolatedEnv } from '../src/test-utils/build-isolated-env.ts';
import { getProgramArtifact } from '../src/test-utils/get-program-artifact.ts';
import { readNodePath } from '../src/test-utils/read-node-path.ts';

async function setupTest() {
  const program = await resolveProgram('auto-mode');
  const node = await readNodePath();
  const created = await mkdtemp(join(tmpdir(), 'auto-mode-e2e-pack-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  const directory = await realpath(created);

  // The release job packs with bun pm pack, so the suite tests that tarball. The package's
  // prepare script installs git hooks, which a pack of the built artifact does not need.
  const packed = await run([process.execPath], {
    args: ['pm', 'pack', '--ignore-scripts', '--quiet', '--destination', directory],
    cwd: program.cwd,
  });

  const tarball = packed.stdout.trim();

  const listing = await run(['tar'], { args: ['-tzf', tarball] });

  await run(['tar'], { args: ['-xzf', tarball, '-C', directory] });

  return {
    node,
    artifact: relative(program.cwd, getProgramArtifact(program)),
    packageDir: join(directory, 'package'),
    files: listing.stdout
      .split('\n')
      .filter((entry) => entry !== '')
      .map((entry) => entry.replace(/^package\//u, '')),
    env: buildIsolatedEnv(process.env, { PATH: process.env['PATH'], HOME: directory }),
  };
}

test('it prints the mod directory of the installed package under node', async () => {
  const ctx = await setupTest();

  const result = await run([ctx.node, join(ctx.packageDir, ctx.artifact)], {
    args: ['mod-path'],
    env: ctx.env,
  });

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: `${join(ctx.packageDir, 'mods', 'auto-mode')}\n`,
    stderr: '',
  });
});

test('it ships a package in which a gitleaks scan with the default rules finds no leak', async () => {
  const ctx = await setupTest();

  const result = await run(['gitleaks'], {
    args: [
      'dir',
      '--no-banner',
      '--redact',
      '--log-level',
      'error',
      '--exit-code',
      '1',
      '--ignore-gitleaks-allow',
      '--gitleaks-ignore-path',
      ctx.packageDir,
      '--report-format',
      'json',
      '--report-path',
      '-',
      ctx.packageDir,
    ],
    env: ctx.env,
  });

  const finding = z.object({ RuleID: z.string(), File: z.string(), StartLine: z.number() });
  const findings = z.array(finding).parse(JSON.parse(result.stdout));

  expect({
    exitCode: result.exitCode,
    findings: findings.map((entry) => `${entry.RuleID} ${entry.File}:${entry.StartLine}`),
  }).toStrictEqual({ exitCode: 0, findings: [] });
});

test('it ships the mod and the secret rule set in the package', async () => {
  const ctx = await setupTest();

  expect(ctx.files).toIncludeAllMembers([
    'dist/secret-rules.json',
    'mods/auto-mode/.claude-plugin/plugin.json',
  ]);
});
