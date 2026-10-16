import { tmpdir } from 'node:os';
import * as z from 'zod';
import type { ProviderConfig } from '../config/config.ts';
import type { ModelRequest } from '../messages/anthropic-client.ts';
import { runCapped } from '../process/run-capped.ts';

export interface ClaudeCodeReply {
  readonly text: string;
  readonly model: string;
  readonly safetyStops: number | null;
  readonly fallback: boolean;
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

  const output = parseOutputJSON(result.stdout);
  const body = CLAUDE_OUTPUT.safeParse(output);

  if (
    result.exitCode !== 0 ||
    !body.success ||
    body.data.is_error ||
    body.data.result === undefined
  ) {
    throw new Error(`claude -p failed with exit code ${String(result.exitCode)}`);
  }

  const usage = MODEL_USAGE_OUTPUT.safeParse(output).data?.modelUsage;
  const stops = SAFETY_STOPS_OUTPUT.safeParse(output).data?.safety_stops;

  return {
    text: body.data.result,
    model: pickAnsweringModel(usage, provider.model),
    safetyStops: stops ?? null,
    fallback: isFallbackReply(usage, stops),
  };
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

// The usage and the stop count are parsed apart from the result, so a malformed
// one keeps a readable reply on the configured model.
const MODEL_USAGE = z.record(z.string(), z.object({ outputTokens: z.number() }));
const MODEL_USAGE_OUTPUT = z.object({ modelUsage: MODEL_USAGE });
const SAFETY_STOPS_OUTPUT = z.object({ safety_stops: z.number() });

function parseOutputJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// A safety stop makes claude -p answer on a fallback model, so the reply's model
// comes from the usage. A background model writes fewer output tokens than the
// reply, and a model with none wrote no part of it.
function pickAnsweringModel(
  usage: Readonly<z.output<typeof MODEL_USAGE>> | undefined,
  requested: string,
): string {
  const writers = Object.entries(usage ?? {}).filter(([, entry]) => entry.outputTokens > 0);
  const [top] = writers.toSorted(([, left], [, right]) => right.outputTokens - left.outputTokens);

  return top === undefined ? requested : top[0];
}

// A model alias resolves to a canonical model ID in the usage, so a reply's model
// cannot show a fallback by name. A safety stop does; without the count, a model
// that wrote nothing beside the one that wrote the reply does.
function isFallbackReply(
  usage: Readonly<z.output<typeof MODEL_USAGE>> | undefined,
  stops: number | undefined,
): boolean {
  if (stops !== undefined) {
    return stops > 0;
  }

  const entries = Object.values(usage ?? {});

  return (
    entries.some((entry) => entry.outputTokens === 0) &&
    entries.some((entry) => entry.outputTokens > 0)
  );
}
