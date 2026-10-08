import type { Config } from './config/config.ts';
import { DEFAULT_SCOPE_SOURCES } from './config/config.ts';
import { loadClaudeRules } from './config/load-claude-rules.ts';
import type { EvaluationOptions } from './config/types.ts';
import { checkContainment } from './containment/check-containment.ts';
import { classifyWithModel } from './model/classify-with-model.ts';
import type { DecisionDiagnostics } from './model/types.ts';
import { readDenialGuidance } from './policy/read-denial-guidance.ts';
import type { ActionRequest, Verdict } from './request/types.ts';
import { classifyLocally } from './rules/classify-locally.ts';

export type DecidingStage = 'local' | 'containment' | 'jev' | 'messages' | 'retry';

export interface ActionOutcome {
  readonly verdict: Verdict | null;
  readonly decidingStage: DecidingStage;
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
      const guidance = config.onFailure === 'deny' ? await tryReadDenialGuidance() : null;

      return {
        verdict:
          config.onFailure === 'deny'
            ? buildGuidedDeny('Classifier Unavailable', 'Claude settings unreadable.', guidance)
            : null,
        decidingStage: 'jev',
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

  // A local allow for regenerable output deletes files, so only a read-only
  // allow comes before the containment check.
  if (local.kind === 'allow' && local.exception === READ_ONLY_EXCEPTION) {
    return buildLocalAllow(local.exception);
  }

  const containment = await checkContainment(request, config.scopeSources ?? DEFAULT_SCOPE_SOURCES);

  if (containment !== null) {
    const guidance = await tryReadDenialGuidance();

    return {
      verdict: buildGuidedDeny(containment.rule, containment.reason, guidance),
      decidingStage: 'containment',
      note: `denied by the containment check: ${containment.findings.map((finding) => finding.target).join(', ')}`,
      status: 'deny',
    };
  }

  if (local.kind === 'allow') {
    return buildLocalAllow(local.exception);
  }

  if (options.localOnly === true) {
    return {
      verdict: null,
      decidingStage: 'local',
      note: `${request.toolName} needs the model tier, which this run skipped`,
      status: 'skipped',
    };
  }

  const [outcome, guidance] = await Promise.all([
    classifyWithModel(request, config, options),
    tryReadDenialGuidance(),
  ]);

  return {
    ...outcome,
    decidingStage: config.provider.protocol === 'system-one' ? 'jev' : 'messages',
    verdict:
      outcome.verdict?.kind === 'deny'
        ? buildGuidedDeny(outcome.verdict.rule, outcome.verdict.reason, guidance)
        : outcome.verdict,
    status: outcome.diagnostics?.status ?? outcome.verdict?.kind ?? 'failure',
  };
}

const READ_ONLY_EXCEPTION = 'Read-only actions';

function buildLocalAllow(exception: string): ActionOutcome {
  return {
    verdict: { kind: 'allow' },
    decidingStage: 'local',
    note: `allowed by ${exception} (local)`,
    status: 'allow',
  };
}

function buildGuidedDeny(rule: string, reason: string, guidance: string | null): Verdict {
  const sentence = /[.!?]$/u.test(reason) ? reason : `${reason}.`;

  return { kind: 'deny', rule, reason: guidance === null ? sentence : `${sentence} ${guidance}` };
}

// A verdict must still reach the mod when the guidance file is missing, or the
// CLI exits without one and the prompt comes back.
async function tryReadDenialGuidance(): Promise<string | null> {
  try {
    return await readDenialGuidance();
  } catch {
    return null;
  }
}
