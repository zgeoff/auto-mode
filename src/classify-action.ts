import { randomUUID } from 'node:crypto';
import { findCurrentDirectUserMessage } from '../mods/auto-mode/contract/find-current-direct-user-message.ts';
import { buildRetryKey } from './budget/build-retry-key.ts';
import { findRetryDeny } from './budget/find-retry-deny.ts';
import { loadDenialState } from './budget/load-denial-state.ts';
import type { DenialPlan } from './budget/plan-denial-budget.ts';
import { planDenialBudget } from './budget/plan-denial-budget.ts';
import { resolveDenialStatePath } from './budget/resolve-denial-state-path.ts';
import type { DenialState } from './budget/types.ts';
import { updateDenialState } from './budget/update-denial-state.ts';
import { tryClassifyEdit } from './bypass/try-classify-edit.ts';
import type { Config } from './config/config.ts';
import {
  DEFAULT_DENIAL_BUDGET,
  DEFAULT_JUDGE_OVERTURNS,
  DEFAULT_SCOPE_SOURCES,
} from './config/config.ts';
import { loadClaudeSettings } from './config/load-claude-settings.ts';
import { readHostEnvironment } from './config/read-host-environment.ts';
import type { EvaluationOptions, HostEnvironment, OutputStream } from './config/types.ts';
import { checkContainment } from './containment/check-containment.ts';
import type { ContainmentDeny } from './containment/check-containment.ts';
import { findUserNamedGrant } from './containment/find-user-named-grant.ts';
import { writeActionDiagnostic } from './diagnostics/write-action-diagnostic.ts';
import { buildRepositoryEvidence } from './git/build-repository-evidence.ts';
import { findCheckout } from './git/find-checkout.ts';
import { loadCheckoutFacts } from './git/load-checkout-facts.ts';
import type { Checkout, CheckoutFacts, CheckoutFinder } from './git/types.ts';
import { classifyWithJudge } from './judge/classify-with-judge.ts';
import type { JudgeOutcome } from './judge/classify-with-judge.ts';
import type { JudgeDiagnostics, JudgeSession } from './judge/types.ts';
import { buildTaskScopeSummary } from './model/build-task-scope-summary.ts';
import { classifyWithJev } from './model/classify-with-jev.ts';
import type { DecisionDiagnostics } from './model/types.ts';
import { buildUnavailableVerdict } from './policy/build-unavailable-verdict.ts';
import { readContainmentRule } from './policy/read-containment-rule.ts';
import { readDenialGuidance } from './policy/read-denial-guidance.ts';
import type { ActionRequest, Verdict } from './request/types.ts';
import { classifyLocally } from './rules/classify-locally.ts';
import type { LocalVerdict } from './rules/classify-locally.ts';
import { loadTaskScope } from './scope/load-task-scope.ts';
import type { OwnedScope } from './scope/types.ts';
import { resolveXDGDir } from './state/resolve-xdg-dir.ts';
import type { DecidingStage } from './types.ts';

export interface ActionOutcome {
  readonly verdict: Verdict | null;
  readonly decidingStage: DecidingStage;
  readonly note: string;
  readonly status: 'allow' | 'skipped' | 'failure' | DecisionDiagnostics['status'];
  readonly unavailable?: boolean;
  readonly diagnostics?: DecisionDiagnostics;
  readonly judge?: JudgeDiagnostics;
  readonly grant?: JudgeDiagnostics;
  readonly denials?: { readonly consecutive: number; readonly session: number };
  readonly escalation?: boolean;
}

export interface ClassifyOptions extends EvaluationOptions {
  readonly localOnly?: boolean;
  readonly budget?: boolean;
  readonly actionLog?: boolean;
  readonly stderr?: Readonly<OutputStream> | undefined;
  readonly findCheckout?: CheckoutFinder | undefined;

  // A caller that classifies more than one action passes a judge session, so
  // the judge process stays warm between them.
  readonly judgeSession?: JudgeSession | undefined;
}

export async function classifyAction(
  request: ActionRequest,
  config: Config,
  options: ClassifyOptions = {},
): Promise<ActionOutcome> {
  const host = options.host ?? readHostEnvironment();
  const stderr = options.stderr ?? process.stderr;
  const invocationID = randomUUID();

  if (options.actionLog === true) {
    await writeActionDiagnostic(request, { invocationID, status: 'started' }, host, stderr);
  }

  const outcome =
    options.budget === true
      ? await classifyWithBudget(request, config, { ...options, host, stderr })
      : await classifyStages(request, config, { ...options, host, stderr });

  if (options.actionLog === true) {
    await writeActionDiagnostic(
      request,
      {
        invocationID,
        status: outcome.status,
        verdict: outcome.verdict?.kind ?? 'defer',
        decidingStage: outcome.decidingStage,
        ...(outcome.denials === undefined ? {} : { denials: outcome.denials }),
        ...(outcome.escalation === undefined ? {} : { escalation: outcome.escalation }),
        ...(outcome.diagnostics === undefined ? {} : { diagnostics: outcome.diagnostics }),
        ...(outcome.judge === undefined ? {} : { judge: outcome.judge }),
        ...(outcome.grant === undefined ? {} : { grant: outcome.grant }),
      },
      host,
      stderr,
    );
  }

  return outcome;
}

async function classifyWithBudget(
  request: ActionRequest,
  config: Config,
  options: ClassifyOptions & Readonly<{ host: HostEnvironment; stderr: OutputStream }>,
): Promise<ActionOutcome> {
  const statePath = resolveDenialStatePath(request, resolveXDGDir(options.host, 'state'));
  const retryKey = buildRetryKey(request);

  const before = await loadDenialState(statePath);

  const retry = findRetryDeny(before, retryKey);

  const outcome: ActionOutcome =
    retry === null
      ? await classifyStages(request, config, options)
      : {
          verdict: retry,
          decidingStage: 'retry',
          note: 'retry of the action just denied; denied again',
          status: 'deny',
        };

  // The plan reads the counts again under the lock, after the classifier,
  // which can take seconds, so a parallel call in the same session keeps its count.
  const plan = await tryUpdateDenialBudget(options.stderr, statePath, (state) =>
    planDenialBudget(
      state,
      outcome.verdict,
      retryKey,
      config.denialBudget ?? DEFAULT_DENIAL_BUDGET,
    ),
  );

  return {
    ...outcome,
    verdict: plan.verdict,
    decidingStage: plan.escalation ? 'budget' : outcome.decidingStage,
    note: plan.escalation ? 'denial budget exhausted; the user decides this action' : outcome.note,
    denials: { consecutive: plan.state.consecutive, session: plan.state.session },
    escalation: plan.escalation,
  };
}

async function classifyStages(
  request: ActionRequest,
  config: Config,
  options: ClassifyOptions & Readonly<{ host: HostEnvironment; stderr: OutputStream }>,
): Promise<ActionOutcome> {
  const host = options.host;
  let claudeSettings = options.claudeSettings;

  if (claudeSettings === undefined) {
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

  const local: LocalVerdict = hasConfiguredDenies ? { kind: 'escalate' } : classifyLocally(request);

  // A local allow for regenerable output deletes files, so only a read-only
  // allow comes before the containment check.
  if (local.kind === 'allow' && local.exception === READ_ONLY_EXCEPTION) {
    return buildLocalAllow(local.exception);
  }

  // Every stage reads the checkout through one finder, which walks up from a
  // directory once per action.
  const findActionCheckout = makeOnceCheckoutFinder(options.findCheckout ?? findCheckout);

  const checkout = await loadCheckoutFacts(request.cwd, host.env, {
    findCheckout: findActionCheckout,
  }).catch(() => null);

  const scope = await tryLoadTaskScope(
    { sessionID: request.sessionID, cwd: request.cwd, checkout, findCheckout: findActionCheckout },
    config,
    host,
    options.stderr,
  );

  const containment = scope === null ? null : checkContainment(request, scope, host.scratchPaths);
  const stageOptions = { ...options, claudeSettings, findCheckout: findActionCheckout };
  const facts = { local, scope, checkout, hasConfiguredDenies };

  if (scope === null || containment === null) {
    return classifyPastContainment(request, config, stageOptions, facts);
  }

  const containmentNote = `denied by the containment check: ${containment.findings.map((finding) => finding.target).join(', ')}`;

  const [grant, guidance] = await Promise.all([
    classifyUserNamedGrant(request, config, options, { containment, scope, checkout }),
    tryReadDenialGuidance(),
  ]);

  if (grant === null || grant.verdict.kind === 'deny') {
    const deny =
      grant?.verdict.kind === 'deny'
        ? grant.verdict
        : { rule: containment.rule, reason: containment.reason };

    return {
      verdict: buildGuidedDeny(deny.rule, deny.reason, guidance),
      decidingStage: 'containment',
      note:
        grant === null
          ? containmentNote
          : `${containmentNote}; judge ${grant.status} (${grant.diagnostics.elapsedMs}ms)`,
      status: 'deny',
      ...(grant === null ? {} : { grant: grant.diagnostics }),
    };
  }

  // The grant clears the scope finding alone: the call still meets Jev and the
  // judge, so a hard rule or a secret in the content still denies it.
  const outcome = await classifyPastContainment(request, config, stageOptions, facts);

  return {
    ...outcome,
    note: `containment cleared by the judge for the targets the user named (${grant.diagnostics.elapsedMs}ms); ${outcome.note}`,
    grant: grant.diagnostics,
  };
}

async function classifyPastContainment(
  request: ActionRequest,
  config: Config,
  options: ClassifyOptions &
    Readonly<{ host: HostEnvironment; stderr: OutputStream; findCheckout: CheckoutFinder }>,
  facts: Readonly<{
    local: LocalVerdict;
    scope: OwnedScope | null;
    checkout: CheckoutFacts | null;
    hasConfiguredDenies: boolean;
  }>,
): Promise<ActionOutcome> {
  const host = options.host;
  const scope = facts.scope;
  const findActionCheckout = options.findCheckout;
  const claudeSettings = options.claudeSettings;

  // Only a regenerable-output allow reaches here, and it deletes files, so
  // without a task scope no containment check has cleared it.
  if (facts.local.kind === 'allow' && scope !== null) {
    return buildLocalAllow(facts.local.exception);
  }

  // A configured deny entry is the user's own rule, and only Jev reads it.
  const edit =
    facts.hasConfiguredDenies || scope === null
      ? null
      : await tryClassifyEdit(request, scope, host, { findCheckout: findActionCheckout });

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
    classifyWithJev(request, config, {
      ...options,
      taskScope,
      host,
      claudeSettings,
      checkout: facts.checkout ?? undefined,
      findCheckout: findActionCheckout,
    }),
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
    decidingStage: 'jev',
    verdict:
      outcome.verdict?.kind === 'deny'
        ? buildGuidedDeny(outcome.verdict.rule, outcome.verdict.reason, guidance)
        : outcome.verdict,
    status: outcome.diagnostics?.status ?? outcome.verdict?.kind ?? 'failure',
  };
}

const READ_ONLY_EXCEPTION = 'Read-only actions';

// The judge reviews a containment deny only when the current direct user
// message names every target, and never in a run that skips the models.
async function classifyUserNamedGrant(
  request: ActionRequest,
  config: Config,
  options: ClassifyOptions & Readonly<{ host: HostEnvironment }>,
  facts: Readonly<{
    containment: ContainmentDeny;
    scope: OwnedScope;
    checkout: CheckoutFacts | null;
  }>,
): Promise<JudgeOutcome | null> {
  const containment = facts.containment;
  const judge = config.judge ?? null;
  const message = findCurrentDirectUserMessage(request.decisionContext?.lastDirectUserMessage);

  if (judge === null || message === null || options.localOnly === true) {
    return null;
  }

  const targets = findUserNamedGrant(containment.findings, message, {
    home: facts.scope.home,
    defaultBranch: facts.checkout?.head?.defaultBranch ?? null,
    protectedBranches: config.protectedBranches,
  });

  if (targets === null) {
    return null;
  }

  // A rule that cannot be read leaves no review to run, so the deny stands.
  const text = await readContainmentRule().catch(() => null);

  if (text === null) {
    return null;
  }

  return classifyWithJudge(
    request,
    {
      rule: { name: containment.rule, tier: 'soft', source: 'shipped', text },
      basis: 'matched',
      repositoryContext:
        facts.checkout === null
          ? null
          : buildRepositoryEvidence(facts.checkout, buildTaskScopeSummary(facts.scope)),
      containment: { reason: containment.reason, targets },
    },
    judge,
    { ...options, rulesPath: config.rulesPath, overturns: 'consent' },
  );
}

// A scope that cannot be read leaves the action to the classifier, the same as
// a target the containment check cannot resolve.
async function tryLoadTaskScope(
  request: Readonly<{
    sessionID: string;
    cwd: string;
    checkout: CheckoutFacts | null;
    findCheckout: CheckoutFinder;
  }>,
  config: Readonly<Config>,
  host: Readonly<HostEnvironment>,
  stderr: Readonly<OutputStream>,
): Promise<OwnedScope | null> {
  try {
    return await loadTaskScope(
      {
        ...request,
        checkout: request.checkout ?? undefined,
        stateDir: resolveXDGDir(host, 'state'),
        protectedBranches: config.protectedBranches,
      },
      config.scopeSources ?? DEFAULT_SCOPE_SOURCES,
      host,
      stderr,
    );
  } catch {
    return null;
  }
}

function makeOnceCheckoutFinder(find: CheckoutFinder): CheckoutFinder {
  const found = new Map<string, Promise<Checkout | null>>();

  return (start, env) => {
    const cached = found.get(start) ?? find(start, env);

    found.set(start, cached);

    return cached;
  };
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

// A plan that changes no count, such as a defer's, takes no lock and writes
// nothing. A lock or write failure keeps the verdict and plans from the read
// taken before the lock, so this call's count can be lost but never doubled.
async function tryUpdateDenialBudget(
  stderr: Readonly<OutputStream>,
  path: string,
  plan: (state: Readonly<DenialState>) => DenialPlan,
): Promise<DenialPlan> {
  const unlocked = await loadDenialState(path);

  const unlockedPlan = plan(unlocked);

  if (unlockedPlan.state === unlocked) {
    return unlockedPlan;
  }

  try {
    const updated = await updateDenialState(path, (state) => plan(state).state);

    return plan(updated.previous);
  } catch {
    stderr.write('auto-mode: denial counts unavailable\n');

    return unlockedPlan;
  }
}
