import type { Config } from '../config/config.ts';
import { resolveApiKey } from '../config/config.ts';
import { loadClaudeSettings } from '../config/load-claude-settings.ts';
import { readHostEnvironment } from '../config/read-host-environment.ts';
import { toTimerDelay } from '../config/to-timer-delay.ts';
import type { EvaluationOptions } from '../config/types.ts';
import type { JudgeEvidence } from '../judge/classify-with-judge.ts';
import { buildUnavailableVerdict } from '../policy/build-unavailable-verdict.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import { findCurrentDirectUserMessage } from '../request/find-current-direct-user-message.ts';
import type { ActionRequest, Verdict } from '../request/types.ts';
import { sendMessage } from './anthropic-client.ts';
import { buildUserMessage } from './build-request.ts';
import { classifyWithJev } from './classify-with-jev.ts';
import { formatClassifierNote } from './format-classifier-note.ts';
import { loadMCPServers } from './load-mcp-servers.ts';
import { loadRepositoryEvidence } from './load-repository-evidence.ts';
import { parseModelVerdict } from './parse-verdict.ts';
import type { DecisionDiagnostics } from './types.ts';

export interface ModelOutcome {
  readonly verdict: Verdict | null;
  readonly note: string;
  readonly unavailable?: boolean;
  readonly diagnostics?: DecisionDiagnostics;

  // Only a Jev deny carries the evidence the judge reviews.
  readonly review?: JudgeEvidence;
}

export async function classifyWithModel(
  payload: ActionRequest,
  config: Config,
  options: EvaluationOptions = {},
): Promise<ModelOutcome> {
  const host = options.host ?? readHostEnvironment();

  if (config.provider.protocol === 'system-one') {
    return classifyWithJev(payload, config, { ...options, host });
  }

  const apiKey = await resolveApiKey(config.provider, { ...options, host });

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

  const directMessage = findCurrentDirectUserMessage(payload.decisionContext);
  const transcript = directMessage === null ? [] : [{ role: 'user', text: directMessage }];

  // The Messages protocol reads no autoMode rules, so the settings serve only the
  // MCP approvals, and a broken rules file must not fail the call.
  const settings = await (options.claudeSettings ?? loadClaudeSettings(null, host));

  const [repositoryContext, mcpServers] = await Promise.all([
    loadRepositoryEvidence(payload.cwd, options.taskScope, host.env).catch(() => null),
    loadMCPServers(payload.cwd, host, settings.userSettings).catch(() => []),
  ]);

  const user = buildUserMessage(
    payload,
    transcript,
    config.provider.reasoning,
    repositoryContext,
    mcpServers,
  );

  try {
    const timeout = options.timeout ?? ((ms: number) => AbortSignal.timeout(ms));

    const result = await sendMessage(
      config.provider,
      apiKey,
      { system, user },
      timeout(toTimerDelay(config.provider.timeoutMs)),
    );

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
      error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
        ? `timed out after ${config.provider.timeoutMs}ms`
        : toMessage(error);

    return buildFailure(
      config,
      formatClassifierNote(`${config.provider.model} failed: ${message}`, apiKey),
    );
  }
}

function buildFailure(config: Config, note: string): ModelOutcome {
  const verdict = buildUnavailableVerdict(
    config.onFailure,
    `${note}; this policy is configured to fail closed.`,
  );

  return { verdict, note: verdict === null ? `${note}; no verdict` : note };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
