import type { Config } from '../config/config.ts';
import { resolveApiKey } from '../config/config.ts';
import { loadClaudeRules } from '../config/load-claude-rules.ts';
import type { EvaluationOptions, HostEnvironment } from '../config/types.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import type { ActionRequest } from '../request/types.ts';
import { buildDecisionRequest } from './build-decision-request.ts';
import type { ModelOutcome } from './classify-with-model.ts';
import { collectDecisionContributors } from './collect-decision-contributors.ts';
import { DecisionRequestError } from './decision-request-error.ts';
import { formatClassifierNote } from './format-classifier-note.ts';
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
  let key: string | null = null;
  let stage: DecisionDiagnostics['stage'] = 'credential';
  const minConfidence = config.minConfidence ?? 0.8;
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

    const directUserText =
      payload.decisionContext?.agentID === null
        ? (payload.decisionContext.lastDirectUserMessage?.text ?? null)
        : null;

    const [policy, rules, repositoryContext] = await Promise.all([
      loadPolicy(
        { classifierPath: config.classifierPath, rulesPath: config.rulesPath },
        'decision.md',
      ),
      loadClaudeRules(config.claudeSettingsPath, options.host),
      loadRepositoryEvidence(payload.cwd, options.taskScope, options.host.env).catch(() => null),
    ]);

    const rulesSource = config.rulesPath === undefined ? 'shipped' : 'replacement';

    const request = buildDecisionRequest(
      payload,
      policy,
      rules,
      directUserText,
      rulesSource,
      repositoryContext,
    );

    const remainingMs =
      options.deadlineAt === undefined
        ? config.provider.timeoutMs
        : options.deadlineAt - Date.now();

    if (remainingMs <= 0 || options.signal?.aborted === true) {
      throw new DOMException('Evaluation deadline expired', 'AbortError');
    }

    const provider = {
      ...config.provider,
      timeoutMs: Math.min(config.provider.timeoutMs, remainingMs),
    };

    stage = 'request';

    const result = await sendDecision(provider, key, request, options.signal);

    stage = 'response';

    const verdict = pickDecisionVerdict(request, result, minConfidence);

    return {
      verdict,
      diagnostics: {
        status: verdict.kind,
        stage,
        keyResolved: true,
        keySource,
        failureReason: null,
        requestBytes: result.requestBytes,
        elapsedMs: Math.round(performance.now() - start),
        minConfidence,
        contributors: collectDecisionContributors(request, result, minConfidence),
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
    } else if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
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
      verdict:
        config.onFailure === 'deny'
          ? { kind: 'deny', rule: 'Classifier Unavailable', reason: note }
          : null,
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
        minConfidence,
        contributors: [],
      },
    };
  }
}
