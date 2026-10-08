import type { Config } from '../config/config.ts';
import { resolveApiKey } from '../config/config.ts';
import type { EvaluationOptions } from '../config/types.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import type { ActionRequest, Verdict } from '../request/types.ts';
import { sendMessage } from './anthropic-client.ts';
import { buildUserMessage } from './build-request.ts';
import { classifyWithJev } from './classify-with-jev.ts';
import { formatClassifierNote } from './format-classifier-note.ts';
import { loadRepositoryEvidence } from './load-repository-evidence.ts';
import { parseModelVerdict } from './parse-verdict.ts';
import type { DecisionDiagnostics } from './types.ts';

export interface ModelOutcome {
  readonly verdict: Verdict | null;
  readonly note: string;
  readonly unavailable?: boolean;
  readonly diagnostics?: DecisionDiagnostics;
}

export async function classifyWithModel(
  payload: ActionRequest,
  config: Config,
  options: EvaluationOptions = {},
): Promise<ModelOutcome> {
  if (config.provider.protocol === 'system-one') {
    return classifyWithJev(payload, config, options);
  }

  const apiKey = await resolveApiKey(config.provider);

  if (apiKey === null) {
    return buildFailure(
      config,
      'no API key: set the configured environment variable or key command',
    );
  }

  let system: string;

  try {
    system = await loadPolicy({
      classifierPath: config.classifierPath,
      rulesPath: config.rulesPath,
    });
  } catch (error) {
    return buildFailure(config, `policy unreadable: ${toMessage(error)}`);
  }

  const directMessage =
    payload.decisionContext?.agentID === null
      ? payload.decisionContext.lastDirectUserMessage
      : null;

  const transcript = directMessage === null ? [] : [{ role: 'user', text: directMessage.text }];

  const repositoryContext = await loadRepositoryEvidence(payload.cwd, options.taskScope).catch(
    () => null,
  );

  const user = buildUserMessage(payload, transcript, config.provider.reasoning, repositoryContext);

  try {
    const result = await sendMessage(config.provider, apiKey, { system, user });

    if (result.text.trim() === '') {
      // Spark returns nothing at all when max_tokens is too low for it to
      // finish reasoning, and an empty answer is not an allow.
      return buildFailure(config, `${config.provider.model} returned no text; raise maxTokens`);
    }

    const verdict = parseModelVerdict(formatClassifierNote(result.text, apiKey));
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

    return buildFailure(
      config,
      formatClassifierNote(`${config.provider.model} failed: ${message}`, apiKey),
    );
  }
}

function buildFailure(config: Config, note: string): ModelOutcome {
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

  return { verdict: null, note: `${note}; no verdict` };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
