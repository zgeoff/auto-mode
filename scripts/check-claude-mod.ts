import { cp, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'auto-mode-mod-check-'));

  const mod = join(directory, 'mod');

  try {
    await mkdir(join(mod, '.claude-plugin'), { recursive: true });

    await cp(
      join(root, 'mods/auto-mode/.claude-plugin/plugin.json'),
      join(mod, '.claude-plugin', 'plugin.json'),
    );

    await cp(join(root, 'mods/auto-mode/hooks'), join(mod, 'hooks'), { recursive: true });

    // The contract's tests run under bun test; the host's plugin test would collect them too.
    await cp(join(root, 'mods/auto-mode/contract'), join(mod, 'contract'), {
      recursive: true,
      filter: (source) => !source.endsWith('.test.ts'),
    });

    // The host's plugin test discovers check files by the canonical test suffix.
    for (const file of await readdir(join(mod, 'hooks'), { recursive: true })) {
      if (file.endsWith('.claude-check.ts')) {
        const stem = file.slice(0, -'.claude-check.ts'.length);

        await rename(join(mod, 'hooks', file), join(mod, 'hooks', `${stem}.test.ts`));
      }
    }

    await cp(join(root, 'mods/auto-mode/tsconfig.json'), join(mod, 'tsconfig.json'));

    // A clean config directory, so the check cannot see this machine's plugins.
    const env = { PATH: process.env['PATH'] ?? '', CLAUDE_CONFIG_DIR: join(directory, 'config') };

    await runClaude(['plugin', 'validate', mod], env);
    await runClaude(['plugin', 'test', mod], env);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runClaude(
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): Promise<void> {
  const claudeBin = Bun.which('claude');

  if (claudeBin === null) {
    throw new Error('claude is not on PATH — install Claude Code before checking the mod');
  }

  const subprocess = Bun.spawn({
    cmd: [claudeBin, ...args],
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await subprocess.exited;

  if (exitCode !== 0) {
    throw new Error(`claude ${args[0]} ${args[1]} exited with ${exitCode}`);
  }
}

await main();
