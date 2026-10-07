import type { Config } from './config/config.ts';
import { loadClaudeRules } from './config/load-claude-rules.ts';
import type { EvaluationOptions } from './config/types.ts';
import { classifyWithModel } from './model/classify-with-model.ts';
import type { DecisionDiagnostics } from './model/types.ts';
import type { ActionRequest, Verdict } from './request/types.ts';
import { classifyLocally } from './rules/classify-locally.ts';

export interface ActionOutcome {
  readonly verdict: Verdict | null;
  readonly note: string;
  readonly status: 'allow' | 'skipped' | 'failure' | DecisionDiagnostics['status'];
  readonly unavailable?: boolean;
  readonly diagnostics?: DecisionDiagnostics;
}

export interface ClassifyOptions extends EvaluationOptions {
  readonly localOnly?: boolean;
}

export async function classifyAction(
  request: ActionRequest,
  config: Config,
  options: ClassifyOptions = {},
): Promise<ActionOutcome> {
  let configured = null;

  if (config.provider.protocol === 'system-one') {
    try {
      configured = await loadClaudeRules(config.claudeSettingsPath);
    } catch {
      return {
        verdict:
          config.onFailure === 'deny'
            ? { kind: 'deny', rule: 'Classifier Unavailable', reason: 'Claude settings unreadable' }
            : null,
        note: 'Claude settings unreadable; classifier unavailable',
        status: 'failure',
        unavailable: true,
      };
    }
  }

  const local =
    configured !== null && (configured.hard_deny.length > 0 || configured.soft_deny.length > 0)
      ? { kind: 'escalate' as const }
      : classifyLocally(request);

  if (local.kind === 'allow') {
    return {
      verdict: { kind: 'allow' },
      note: `allowed by ${local.exception} (local)`,
      status: 'allow',
    };
  }

  if (options.localOnly === true) {
    return {
      verdict: null,
      note: `${request.toolName} needs the model tier, which this run skipped`,
      status: 'skipped',
    };
  }

  const outcome = await classifyWithModel(request, config, options);

  return {
    ...outcome,
    status: outcome.diagnostics?.status ?? outcome.verdict?.kind ?? 'failure',
  };
}
