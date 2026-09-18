import type { Config } from '../config/config.ts';
import { resolveApiKey } from '../config/config.ts';
import type { HookPayload, Verdict } from '../harness/types.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import { readTranscript } from '../transcript/read-transcript.ts';
import { callModel } from './anthropic-client.ts';
import { buildUserMessage } from './build-request.ts';
import { parseModelVerdict } from './parse-verdict.ts';

export interface ModelOutcome {
  readonly verdict: Verdict | null;
  readonly note: string;
}

export async function classifyWithModel(
  payload: HookPayload,
  config: Config,
): Promise<ModelOutcome> {
  const apiKey = await resolveApiKey(config.provider);

  if (apiKey === null) {
    return failure(config, 'no API key: set the configured environment variable or key command');
  }

  let system: string;

  try {
    system = await loadPolicy({
      classifierPath: config.classifierPath,
      rulesPath: config.rulesPath,
    });
  } catch (error) {
    return failure(config, `policy unreadable: ${toMessage(error)}`);
  }

  const transcript = await readTranscript(payload.transcriptPath, config.transcriptEntries);

  const user = buildUserMessage(payload, transcript, config.provider.reasoning);

  try {
    const result = await callModel(config.provider, apiKey, { system, user });

    if (result.text.trim() === '') {
      // Spark returns nothing at all when max_tokens is too low for it to
      // finish reasoning, and an empty answer is not an allow.
      return failure(config, `${config.provider.model} returned no text; raise maxTokens`);
    }

    const verdict = parseModelVerdict(result.text);
    const cache = `${result.cachedInputTokens} cached / ${result.cacheWriteTokens} written / ${result.newInputTokens} new / ${result.outputTokens} out`;

    return {
      verdict,
      note:
        verdict.kind === 'deny'
          ? `${config.provider.model} blocked it: [${verdict.rule}] ${verdict.reason} (${cache})`
          : `${config.provider.model} allowed it (${cache})`,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `timed out after ${config.provider.timeoutMs}ms`
        : toMessage(error);

    return failure(config, `${config.provider.model} failed: ${message}`);
  }
}

function failure(config: Config, note: string): ModelOutcome {
  if (config.onFailure === 'deny') {
    return {
      verdict: {
        kind: 'deny',
        rule: 'Classifier Unavailable',
        reason: `${note}; this policy is configured to fail closed.`,
      },
      note,
    };
  }

  return { verdict: null, note: `${note}; deferring to the harness` };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
