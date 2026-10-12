import { tmpdir } from 'node:os';
import * as z from 'zod';
import type { ProviderConfig } from '../config/config.ts';
import type { ModelRequest } from '../messages/anthropic-client.ts';
import { runCapped } from '../process/run-capped.ts';

export interface ClaudeCodeReply {
  readonly text: string;
  readonly model: string;
}

// A judge reply is a verdict and a short reason; this much output is not one.
const MAX_REPLY_BYTES = 1_048_576;

// Runs one prompt through `claude -p` with no tools, settings, MCP servers or
// session file, so the judge cannot act and no hook of the session runs in it.
export async function runClaudeCode(
  provider: Readonly<ProviderConfig>,
  request: Readonly<ModelRequest>,
  env: Readonly<Record<string, string | undefined>>,
  signal: Readonly<AbortSignal>,
): Promise<ClaudeCodeReply> {
  const result = await runCapped(
    'claude',
    [
      '-p',
      '--model',
      provider.model,
      '--system-prompt',
      request.system,
      '--tools',
      '',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--no-session-persistence',
      '--output-format',
      'json',
    ],
    {
      signal,
      maxOutputBytes: MAX_REPLY_BYTES,
      input: request.user,
      cwd: tmpdir(),
      env: buildChildEnv(env),
    },
  );

  const body = CLAUDE_OUTPUT.safeParse(parseOutputJSON(result.stdout));

  if (
    result.exitCode !== 0 ||
    !body.success ||
    body.data.is_error ||
    body.data.result === undefined
  ) {
    throw new Error(`claude -p failed with exit code ${String(result.exitCode)}`);
  }

  return { text: body.data.result, model: provider.model };
}

// A session pointed at another provider passes its endpoint and key in these
// variables, and the judge must reach Claude through the claude login instead.
function buildChildEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const kept = Object.entries(env).filter(
    ([name]) => !name.startsWith('ANTHROPIC_') && !PROVIDER_SWITCHES.has(name),
  );

  // Claude Code adds a thinking budget by default, which took a measured judge
  // call from 11 s to 47 s.
  return { ...Object.fromEntries(kept), MAX_THINKING_TOKENS: '0' };
}

const PROVIDER_SWITCHES = new Set([
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
]);

const CLAUDE_OUTPUT = z.object({ is_error: z.boolean(), result: z.string().optional() });

function parseOutputJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
