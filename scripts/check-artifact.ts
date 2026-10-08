import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'auto-mode-artifact-'));

  try {
    await mkdir(join(dir, 'auto-mode'));

    await writeFile(
      join(dir, 'auto-mode', 'config.json'),
      JSON.stringify({ decision: { classifier: 'jev' }, policy: { claudeSettingsPath: null } }),
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

    const edit = buildRequest('Write', { file_path: '/repo/file.ts', content: 'green' });

    const bypass = await Bun.$`node ${cli} run < ${new Response(edit)}`.env(env).quiet().nothrow();

    if (bypass.exitCode !== 0 || bypass.stdout.toString() !== expected) {
      throw new Error('Node artifact did not allow an in-scope edit through the edit bypass');
    }

    // Joined at runtime so that the repository's own secret scan passes this file.
    const token = ['ghp', '_', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2Rl'].join('');

    for (const [label, toolName, toolInput] of [
      ['a shell write', 'Bash', { command: 'touch /repo/file.ts' }],
      ['an edit with a secret', 'Write', { file_path: '/repo/token.ts', content: token }],
    ] as const) {
      const request = buildRequest(toolName, toolInput);

      const missingKey = await Bun.$`node ${cli} run < ${new Response(request)}`
        .env(env)
        .quiet()
        .nothrow();

      if (
        missingKey.exitCode !== 0 ||
        missingKey.stdout.length > 0 ||
        !missingKey.stderr.toString().includes('no API key')
      ) {
        throw new Error(`Node artifact did not send ${label} to Jev and defer on the missing key`);
      }
    }

    console.log('Node artifact: local verdict, edit bypass, and missing-key fallback passed');
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
