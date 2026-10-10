import { tryClassifyEdit } from './bypass/try-classify-edit.ts';
import type { Config } from './config/config.ts';
import { DEFAULT_JUDGE_OVERTURNS, DEFAULT_SCOPE_SOURCES } from './config/config.ts';
import { loadClaudeSettings } from './config/load-claude-settings.ts';
import { readHostEnvironment } from './config/read-host-environment.ts';
import type { EvaluationOptions, HostEnvironment, OutputStream } from './config/types.ts';
import { checkContainment } from './containment/check-containment.ts';
import type { OwnedScope } from './containment/collect-scope-findings.ts';
import { classifyWithJudge } from './judge/classify-with-judge.ts';
import type { JudgeDiagnostics } from './judge/types.ts';
import { buildTaskScopeSummary } from './model/build-task-scope-summary.ts';
import { classifyWithModel } from './model/classify-with-model.ts';
import type { DecisionDiagnostics } from './model/types.ts';
import { buildUnavailableVerdict } from './policy/build-unavailable-verdict.ts';
import { readDenialGuidance } from './policy/read-denial-guidance.ts';
import type { ActionRequest, Verdict } from './request/types.ts';
import { classifyLocally } from './rules/classify-locally.ts';
import { loadTaskScope } from './scope/load-task-scope.ts';
import { resolveStateDir } from './state/resolve-state-dir.ts';

export type DecidingStage =
  | 'local'
  | 'containment'
  | 'bypass'
  | 'jev'
  | 'judge'
  | 'messages'
  | 'retry';

export interface ActionOutcome {
  readonly verdict: Verdict | null;
  readonly decidingStage: DecidingStage;
  readonly note: string;
  readonly status: 'allow' | 'skipped' | 'failure' | DecisionDiagnostics['status'];
  readonly unavailable?: boolean;
  readonly diagnostics?: DecisionDiagnostics;
  readonly judge?: JudgeDiagnostics;
}

export interface ClassifyOptions extends EvaluationOptions {
  readonly localOnly?: boolean;
  readonly stderr?: Readonly<OutputStream> | undefined;
}

export async function classifyAction(
  request: ActionRequest,
  config: Config,
  options: ClassifyOptions = {},
): Promise<ActionOutcome> {
  const host = options.host ?? readHostEnvironment();
  let claudeSettings = options.claudeSettings;

  if (config.provider.protocol === 'system-one' && claudeSettings === undefined) {
    try {
      claudeSettings = await loadClaudeSettings(config.claudeSettingsPath, host);
    } catch {
      const unavailable = buildUnavailableVerdict(config.onFailure, 'Claude settings unreadable.');
      const guidance = unavailable === null ? null : await tryReadDenialGuidance();

      return {
        verdict:
          unavailable?.kind === 'deny'
            ? buildGuidedDeny(unavailable.rule, unavailable.reason, guidance)
            : null,
        decidingStage: 'jev',
        note: 'Claude settings unreadable; classifier unavailable',
        status: 'failure',
        unavailable: true,
      };
    }
  }

  const configured = claudeSettings?.rules;

  const hasConfiguredDenies =
    configured !== undefined &&
    (configured.hard_deny.length > 0 || configured.soft_deny.length > 0);

  const local = hasConfiguredDenies ? { kind: 'escalate' as const } : classifyLocally(request);

  // A local allow for regenerable output deletes files, so only a read-only
  // allow comes before the containment check.
  if (local.kind === 'allow' && local.exception === READ_ONLY_EXCEPTION) {
    return buildLocalAllow(local.exception);
  }

  const scope = await tryLoadTaskScope(request, config, host, options.stderr ?? process.stderr);

  const containment = scope === null ? null : checkContainment(request, scope, host.scratchPaths);

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

  // A configured deny entry is the user's own rule, and only Jev reads it.
  const edit =
    hasConfiguredDenies || scope === null ? null : await tryClassifyEdit(request, scope, host);

  if (edit?.kind === 'bypass') {
    return {
      verdict: { kind: 'allow' },
      decidingStage: 'bypass',
      note: `allowed by the edit bypass: ${edit.target}`,
      status: 'allow',
    };
  }

  if (options.localOnly === true) {
    return {
      verdict: null,
      decidingStage: 'local',
      note: `${request.toolName} needs the model tier, which this run skipped`,
      status: 'skipped',
    };
  }

  const taskScope = scope === null ? undefined : buildTaskScopeSummary(scope);

  const [outcome, guidance] = await Promise.all([
    classifyWithModel(request, config, { ...options, taskScope, host, claudeSettings }),
    tryReadDenialGuidance(),
  ]);

  const judge = config.judge ?? null;

  if (outcome.verdict?.kind === 'deny' && outcome.review !== undefined && judge !== null) {
    const judged = await classifyWithJudge(request, outcome.review, judge, {
      ...options,
      host,
      rulesPath: config.rulesPath,
      overturns: config.judgeOverturns ?? DEFAULT_JUDGE_OVERTURNS,
    });

    const { review: _review, ...rest } = outcome;

    return {
      ...rest,
      decidingStage: 'judge',
      note: `${outcome.note}; judge ${judged.status} (${judged.diagnostics.elapsedMs}ms)`,
      verdict:
        judged.verdict.kind === 'deny'
          ? buildGuidedDeny(judged.verdict.rule, judged.verdict.reason, guidance)
          : judged.verdict,
      status: judged.verdict.kind,
      judge: judged.diagnostics,
    };
  }

  const { review: _review, ...rest } = outcome;

  return {
    ...rest,
    decidingStage: config.provider.protocol === 'system-one' ? 'jev' : 'messages',
    verdict:
      outcome.verdict?.kind === 'deny'
        ? buildGuidedDeny(outcome.verdict.rule, outcome.verdict.reason, guidance)
        : outcome.verdict,
    status: outcome.diagnostics?.status ?? outcome.verdict?.kind ?? 'failure',
  };
}

const READ_ONLY_EXCEPTION = 'Read-only actions';

// A scope that cannot be read leaves the action to the classifier, the same as
// a target the containment check cannot resolve.
async function tryLoadTaskScope(
  request: Readonly<ActionRequest>,
  config: Readonly<Config>,
  host: Readonly<HostEnvironment>,
  stderr: Readonly<OutputStream>,
): Promise<OwnedScope | null> {
  try {
    return await loadTaskScope(
      { sessionID: request.sessionID, cwd: request.cwd, stateDir: resolveStateDir(host) },
      config.scopeSources ?? DEFAULT_SCOPE_SOURCES,
      host,
      stderr,
    );
  } catch {
    return null;
  }
}

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
