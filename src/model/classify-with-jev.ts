import { findCurrentDirectUserMessage } from '../../mods/auto-mode/contract/find-current-direct-user-message.ts';
import type { Config } from '../config/config.ts';
import { DEFAULT_BLOCK_THRESHOLD, resolveApiKey } from '../config/config.ts';
import { loadClaudeSettings } from '../config/load-claude-settings.ts';
import { toTimerDelay } from '../config/to-timer-delay.ts';
import type { EvaluationOptions, HostEnvironment } from '../config/types.ts';
import { buildUnavailableVerdict } from '../policy/build-unavailable-verdict.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import type { ActionRequest } from '../request/types.ts';
import { buildDecisionRequest } from './build-decision-request.ts';
import type { ModelOutcome } from './classify-with-model.ts';
import { collectDecisionContributors } from './collect-decision-contributors.ts';
import { DecisionRequestError } from './decision-request-error.ts';
import { findReviewedRule } from './find-reviewed-rule.ts';
import { formatClassifierNote } from './format-classifier-note.ts';
import { loadMCPServers } from './load-mcp-servers.ts';
import { loadRepositoryEvidence } from './load-repository-evidence.ts';
import { pickDecisionVerdict } from './pick-decision-verdict.ts';
import { sendDecision } from './send-decision.ts';
import type { DecisionDiagnostics } from './types.ts';

export async function classifyWithJev(
  payload: ActionRequest,
  config: Config,
  options: Readonly<EvaluationOptions & { readonly host: Readonly<HostEnvironment> }>,
): Promise<ModelOutcome> {
  const start = performance.now();
  const now = options.now ?? Date.now;
  let key: string | null = null;
  let stage: DecisionDiagnostics['stage'] = 'credential';
  const blockThreshold = config.blockThreshold ?? DEFAULT_BLOCK_THRESHOLD;
  let keySource: DecisionDiagnostics['keySource'] = 'none';

  const envKey =
    config.provider.apiKeyEnv === undefined
      ? undefined
      : options.host.env[config.provider.apiKeyEnv];

  if (envKey !== undefined && envKey !== '') {
    keySource = 'environment';
  } else if (config.provider.apiKeyCommand !== undefined && config.provider.apiKeyCommand !== '') {
    keySource = 'command';
  }

  try {
    key = await resolveApiKey(config.provider, options);

    if (key === null) {
      throw new Error('no API key: set the configured environment variable or key command');
    }

    stage = 'evidence';

    const directUserText = findCurrentDirectUserMessage(
      payload.decisionContext?.lastDirectUserMessage,
    );

    const settings = await (options.claudeSettings ??
      loadClaudeSettings(config.claudeSettingsPath, options.host));

    const [policy, repositoryContext, mcpServers] = await Promise.all([
      loadPolicy(
        { classifierPath: config.classifierPath, rulesPath: config.rulesPath },
        'decision.md',
      ),
      loadRepositoryEvidence(payload.cwd, options.taskScope, options.host.env).catch(() => null),
      loadMCPServers(payload.cwd, options.host, settings.userSettings).catch(() => []),
    ]);

    const rulesSource = config.rulesPath === undefined ? 'shipped' : 'replacement';

    const request = buildDecisionRequest(
      payload,
      policy,
      settings.rules,
      directUserText,
      rulesSource,
      repositoryContext,
      mcpServers,
    );

    const remainingMs =
      options.deadlineAt === undefined ? config.provider.timeoutMs : options.deadlineAt - now();

    if (remainingMs <= 0 || options.signal?.aborted === true) {
      throw new DOMException('Evaluation deadline expired', 'AbortError');
    }

    const timeout = options.timeout ?? ((ms: number) => AbortSignal.timeout(ms));
    const timer = timeout(toTimerDelay(Math.min(config.provider.timeoutMs, remainingMs)));
    const signal = options.signal === undefined ? timer : AbortSignal.any([timer, options.signal]);

    stage = 'request';

    const result = await sendDecision(config.provider, key, request, signal);

    stage = 'response';

    const verdict = pickDecisionVerdict(request, result, blockThreshold);
    const denied = findReviewedRule(request, result, blockThreshold);

    return {
      verdict,
      ...(denied === null ? {} : { review: { ...denied, repositoryContext } }),
      diagnostics: {
        status: verdict.kind,
        stage,
        keyResolved: true,
        keySource,
        failureReason: null,
        requestBytes: result.requestBytes,
        elapsedMs: Math.round(performance.now() - start),
        blockThreshold,
        contributors: collectDecisionContributors(request, result, blockThreshold),
      },
      note: formatClassifierNote(
        `${config.provider.model}: ${verdict.kind} (${Math.round(performance.now() - start)}ms, ${result.inputTokens} input tokens)`,
        key,
      ),
    };
  } catch (error) {
    let reason = 'classifier failed';
    let status: DecisionDiagnostics['status'] = 'failure';

    if (options.signal?.aborted === true) {
      reason = 'evaluation cancelled';
      status = 'cancelled';
    } else if (options.deadlineAt !== undefined && now() >= options.deadlineAt) {
      reason = 'evaluation deadline expired';
      status = 'timeout';
    } else if (error instanceof Error) {
      const isTimeout =
        error.name === 'AbortError' ||
        (error instanceof DecisionRequestError && error.reason === 'aborted');

      if (isTimeout) {
        status = 'timeout';
      }

      reason = isTimeout ? `timed out after ${config.provider.timeoutMs}ms` : error.message;
    }

    const note = formatClassifierNote(`${config.provider.model} unavailable: ${reason}`, key);

    return {
      verdict: buildUnavailableVerdict(config.onFailure, note),
      note,
      unavailable: true,
      diagnostics: {
        status,
        stage,
        keyResolved: key !== null,
        keySource,
        failureReason: error instanceof DecisionRequestError ? error.reason : null,
        requestBytes: error instanceof DecisionRequestError ? error.requestBytes : null,
        elapsedMs: Math.round(performance.now() - start),
        blockThreshold,
        contributors: [],
      },
    };
  }
}
