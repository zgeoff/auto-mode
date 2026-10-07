import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-artifact-'));

  try {
    await mkdir(join(dir, 'auto-mode'));

    await writeFile(
      join(dir, 'auto-mode', 'config.json'),
      JSON.stringify({ preset: 'jev', claudeSettingsPath: null }),
    );

    const env = {
      ...process.env,
      XDG_CONFIG_HOME: dir,
      XDG_STATE_HOME: dir,
      AUTO_MODE_DIAGNOSTICS_PATH: join(dir, 'actions.jsonl'),
      CLAUDE_CONFIG_DIR: dir,
      TYPESAFE_API_KEY: '',
    };

    const cli = join(import.meta.dirname, '..', 'dist', 'cli.js');
    const payload = buildRequest('Read', { file_path: '/repo/file.ts' });

    const local = await Bun.$`node ${cli} run < ${new Response(payload)}`
      .env(env)
      .quiet()
      .nothrow();

    const expected = JSON.stringify({ decision: 'allow' });

    if (local.exitCode !== 0 || local.stdout.toString() !== expected) {
      throw new Error('Node artifact did not return the local verdict');
    }

    const write = buildRequest('Write', { file_path: '/repo/file.ts', content: 'green' });

    const missingKey = await Bun.$`node ${cli} run < ${new Response(write)}`
      .env(env)
      .quiet()
      .nothrow();

    if (
      missingKey.exitCode !== 0 ||
      missingKey.stdout.length > 0 ||
      !missingKey.stderr.toString().includes('no API key')
    ) {
      throw new Error('Node artifact did not defer with a diagnostic for the missing Jev key');
    }

    console.log('Node artifact: local verdict and missing-key fallback passed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function buildRequest(toolName: string, toolInput: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({
    sessionID: 'artifact-check',
    cwd: '/repo',
    toolName,
    toolInput,
    context: {
      agentID: null,
      originalUserTask: null,
      delegatedTask: null,
      lastDirectUserMessage: null,
      omittedTaskContext: [],
    },
  });
}

await main();
