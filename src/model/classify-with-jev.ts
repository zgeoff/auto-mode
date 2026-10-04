import type { Config } from '../config/config.ts';
import { resolveApiKey } from '../config/config.ts';
import { loadClaudeRules } from '../config/load-claude-rules.ts';
import type { EvaluationOptions } from '../config/types.ts';
import type { HookPayload } from '../harness/types.ts';
import { loadPolicy } from '../policy/load-policy.ts';
import { readLastUserMessage } from '../transcript/read-last-user-message.ts';
import { buildDecisionRequest } from './build-decision-request.ts';
import type { ModelOutcome } from './classify-with-model.ts';
import { collectDecisionContributors } from './collect-decision-contributors.ts';
import { formatClassifierNote } from './format-classifier-note.ts';
import { pickDecisionVerdict } from './pick-decision-verdict.ts';
import { sendDecision } from './send-decision.ts';
import type { DecisionDiagnostics } from './types.ts';

export async function classifyWithJev(
  payload: HookPayload,
  config: Config,
  options: EvaluationOptions = {},
): Promise<ModelOutcome> {
  const start = performance.now();
  let key: string | null = null;
  let stage: DecisionDiagnostics['stage'] = 'credential';
  const minConfidence = config.minConfidence ?? 0.8;
  let keySource: DecisionDiagnostics['keySource'] = 'none';

  const envKey =
    config.provider.apiKeyEnv === undefined ? undefined : process.env[config.provider.apiKeyEnv];

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

    const [policy, rules, lastUserMessage] = await Promise.all([
      loadPolicy(
        { classifierPath: config.classifierPath, rulesPath: config.rulesPath },
        'decision.md',
      ),
      loadClaudeRules(config.claudeSettingsPath),
      payload.decisionContext === undefined
        ? readLastUserMessage(payload.transcriptPath)
        : Promise.resolve(directUserText),
    ]);

    const rulesSource = config.rulesPath === undefined ? 'shipped' : 'replacement';
    const request = buildDecisionRequest(payload, policy, rules, lastUserMessage, rulesSource);

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
        elapsedMs: Math.round(performance.now() - start),
        minConfidence,
        contributors: collectDecisionContributors(request, result, verdict, minConfidence),
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
      if (error.name === 'AbortError') {
        status = 'timeout';
      }

      reason =
        error.name === 'AbortError'
          ? `timed out after ${config.provider.timeoutMs}ms`
          : error.message;
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
        elapsedMs: Math.round(performance.now() - start),
        minConfidence,
        contributors: [],
      },
    };
  }
}
