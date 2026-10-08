import { dirname, resolve } from 'node:path';
import type { EditClassification } from './bypass/classify-edit.ts';
import { getEditFields } from './bypass/get-edit-fields.ts';
import { resolveEditTarget } from './bypass/resolve-edit-target.ts';
import type { Config } from './config/config.ts';
import { DEFAULT_SCOPE_SOURCES, resolveConfigPath } from './config/config.ts';
import { loadClaudeRules } from './config/load-claude-rules.ts';
import type { EvaluationOptions } from './config/types.ts';
import { checkContainment } from './containment/check-containment.ts';
import type { OwnedScope } from './containment/collect-scope-findings.ts';
import { classifyWithModel } from './model/classify-with-model.ts';
import type { DecisionDiagnostics } from './model/types.ts';
import { readDenialGuidance } from './policy/read-denial-guidance.ts';
import type { ActionRequest, Verdict } from './request/types.ts';
import { classifyLocally } from './rules/classify-locally.ts';
import { loadTaskScope } from './scope/load-task-scope.ts';
import { resolveStateDir } from './state/resolve-state-dir.ts';

export type DecidingStage = 'local' | 'containment' | 'bypass' | 'jev' | 'messages' | 'retry';

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

  const hasConfiguredDenies =
    configured !== null && (configured.hard_deny.length > 0 || configured.soft_deny.length > 0);

  const local = hasConfiguredDenies ? { kind: 'escalate' as const } : classifyLocally(request);

  // A local allow for regenerable output deletes files, so only a read-only
  // allow comes before the containment check.
  if (local.kind === 'allow' && local.exception === READ_ONLY_EXCEPTION) {
    return buildLocalAllow(local.exception);
  }

  const scope = await tryLoadTaskScope(request, config);

  const containment = scope === null ? null : checkContainment(request, scope);

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
  const edit = hasConfiguredDenies || scope === null ? null : await tryClassifyEdit(request, scope);

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

// A scope that cannot be read leaves the action to the classifier, the same as
// a target the containment check cannot resolve.
async function tryLoadTaskScope(
  request: Readonly<ActionRequest>,
  config: Readonly<Config>,
): Promise<OwnedScope | null> {
  try {
    return await loadTaskScope(
      { sessionID: request.sessionID, cwd: request.cwd, stateDir: resolveStateDir() },
      config.scopeSources ?? DEFAULT_SCOPE_SOURCES,
    );
  } catch {
    return null;
  }
}

async function tryClassifyEdit(
  request: Readonly<ActionRequest>,
  scope: Readonly<OwnedScope>,
): Promise<EditClassification | null> {
  const fields = getEditFields(request.toolName);
  const path = fields === null ? undefined : request.toolInput[fields.path];

  if (typeof path !== 'string' || path === '') {
    return null;
  }

  try {
    const ownDirs = [dirname(resolveConfigPath()), resolveStateDir()];
    const requested = resolve(request.cwd, path);

    const [target, worktrees, protectedDirs] = await Promise.all([
      resolveEditTarget(requested),
      Promise.all(scope.worktrees.map((worktree) => resolveEditTarget(worktree))),
      Promise.all(ownDirs.map((dir) => resolveEditTarget(dir))),
    ]);

    if (target === null) {
      return null;
    }

    // The rule set and its regex engine add about 10 ms to a CLI start, so
    // only an edit that reaches this point loads them.
    const bypass = await import('./bypass/classify-edit.ts');

    return bypass.classifyEdit(
      { toolName: request.toolName, toolInput: request.toolInput, requested, target },
      {
        worktrees: worktrees.filter((worktree) => worktree !== null),
        protectedDirs: [...ownDirs, ...protectedDirs.filter((dir) => dir !== null)],
      },
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
