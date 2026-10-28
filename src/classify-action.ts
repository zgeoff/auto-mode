import { randomUUID } from 'node:crypto';
import { findCurrentDirectUserMessage } from '../mods/auto-mode/contract/find-current-direct-user-message.ts';
import { buildRetryKey } from './budget/build-retry-key.ts';
import { findRetryDeny } from './budget/find-retry-deny.ts';
import { loadDenialState } from './budget/load-denial-state.ts';
import { planDenialBudget } from './budget/plan-denial-budget.ts';
import { resolveDenialStatePath } from './budget/resolve-denial-state-path.ts';
import { tryUpdateDenialBudget } from './budget/try-update-denial-budget.ts';
import { tryClassifyEdit } from './bypass/try-classify-edit.ts';
import type { Config } from './config/config.ts';
import {
  DEFAULT_DENIAL_BUDGET,
  DEFAULT_JUDGE_OVERTURNS,
  DEFAULT_SCOPE_SOURCES,
} from './config/config.ts';
import { loadClaudeSettings } from './config/load-claude-settings.ts';
import type {
  ClaudeSettings,
  EvaluationOptions,
  HostEnvironment,
  OutputStream,
  TextFileReader,
} from './config/types.ts';
import { checkContainment } from './containment/check-containment.ts';
import type { ContainmentDeny } from './containment/check-containment.ts';
import { findUserNamedGrant } from './containment/find-user-named-grant.ts';
import { writeActionDiagnostic } from './diagnostics/write-action-diagnostic.ts';
import { buildRepositoryEvidence } from './git/build-repository-evidence.ts';
import { loadCheckoutFacts } from './git/load-checkout-facts.ts';
import { makeOnceCheckoutReader } from './git/make-once-checkout-reader.ts';
import type { CheckoutFacts, CheckoutReader } from './git/types.ts';
import { classifyWithJudge } from './judge/classify-with-judge.ts';
import type { JudgeDiagnostics, JudgeSession } from './judge/types.ts';
import { buildTaskScopeSummary } from './model/build-task-scope-summary.ts';
import { classifyWithJev } from './model/classify-with-jev.ts';
import type { DecisionDiagnostics } from './model/types.ts';
import { buildGuidedVerdict } from './policy/build-guided-verdict.ts';
import { buildUnavailableVerdict } from './policy/build-unavailable-verdict.ts';
import { readContainmentRule } from './policy/read-containment-rule.ts';
import { readDenialGuidance } from './policy/read-denial-guidance.ts';
import type { ActionRequest, Verdict } from './request/types.ts';
import { classifyLocally } from './rules/classify-locally.ts';
import type { LocalVerdict } from './rules/classify-locally.ts';
import { findReplyChannel } from './scope/find-reply-channel.ts';
import { loadTaskScope } from './scope/load-task-scope.ts';
import type { OwnedScope } from './scope/types.ts';
import { resolveXDGDir } from './state/resolve-xdg-dir.ts';
import type { DecidingStage, JudgeEvidence } from './types.ts';

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
  readonly stderr: Readonly<OutputStream>;

  readonly judgeSession?: JudgeSession | undefined;
}

export async function classifyAction(
  request: ActionRequest,
  config: Config,
  options: Readonly<ClassifyOptions>,
): Promise<ActionOutcome> {
  const stderr = options.stderr;
  const host = options.runtime.host;
  const invocationID = randomUUID();

  if (options.actionLog === true) {
    await writeActionDiagnostic(request, { invocationID, status: 'started' }, host, stderr);
  }

  const outcome =
    options.budget === true
      ? await classifyWithBudget(request, config, options)
      : await classifyStages(request, config, options);

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

type StageOptions = Readonly<ClassifyOptions>;

async function classifyWithBudget(
  request: ActionRequest,
  config: Config,
  options: StageOptions,
): Promise<ActionOutcome> {
  const statePath = resolveDenialStatePath(request, resolveXDGDir(options.runtime.host, 'state'));
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

interface PendingGrant {
  readonly evidence: JudgeEvidence;
  readonly note: string;
}

interface StageFacts {
  readonly claudeSettings: ClaudeSettings | undefined;
  readonly hasConfiguredDenies: boolean;
  readonly local: LocalVerdict;
  readonly checkout: CheckoutFacts | null;
  readonly scope: OwnedScope | null;
  readonly grant: PendingGrant | null;
}

interface StageContext extends StageFacts {
  readonly request: ActionRequest;
  readonly config: Config;
  readonly options: StageOptions;
  readonly readCheckout: CheckoutReader;
}

async function classifyStages(
  request: ActionRequest,
  config: Config,
  options: StageOptions,
): Promise<ActionOutcome> {
  const ctx: StageContext = {
    request,
    config,
    options,

    readCheckout: makeOnceCheckoutReader(options.runtime.readCheckout),
    claudeSettings: options.claudeSettings,
    hasConfiguredDenies: false,
    local: { kind: 'escalate' },
    checkout: null,
    scope: null,
    grant: null,
  };

  const outcome = await runStages(ctx);
  const reviewed = await classifyWithGrant(ctx, outcome);

  if (reviewed.verdict?.kind !== 'deny') {
    return reviewed;
  }

  const guidance = await tryReadDenialGuidance();

  return { ...reviewed, verdict: buildGuidedVerdict(reviewed.verdict, guidance) };
}

type StageOutcome = ActionOutcome & { readonly review?: JudgeEvidence };

type StageDecision =
  | { readonly kind: 'decided'; readonly outcome: StageOutcome }
  | { readonly kind: 'pass'; readonly facts?: Partial<StageFacts> };

interface Stage {
  readonly decide: (ctx: Readonly<StageContext>) => StageDecision | Promise<StageDecision>;
}

const STAGES: readonly Stage[] = [
  { decide: classifyClaudeSettings },
  { decide: classifyReadOnly },
  { decide: classifyContainment },
  { decide: classifyRegenerable },
  { decide: classifyEditBypass },
  { decide: classifyReplyChannel },
  { decide: classifyLocalOnly },
];

interface FinalStage {
  readonly decide: (ctx: Readonly<StageContext>) => Promise<StageOutcome>;
}

const FINAL_STAGE: FinalStage = { decide: classifyJev };

async function runStages(ctx: StageContext): Promise<StageOutcome> {
  for (const stage of STAGES) {
    const decision = await stage.decide(ctx);

    if (decision.kind === 'decided') {
      return decision.outcome;
    }

    Object.assign(ctx, decision.facts);
  }

  return FINAL_STAGE.decide(ctx);
}

async function classifyClaudeSettings(ctx: Readonly<StageContext>): Promise<StageDecision> {
  const settings = await (ctx.claudeSettings ??
    loadClaudeSettings(ctx.config.claudeSettingsPath, ctx.options.runtime.host).catch(() => null));

  if (settings === null) {
    const unavailable = buildUnavailableVerdict(
      ctx.config.onFailure,
      'Claude settings unreadable.',
    );

    return {
      kind: 'decided',
      outcome: {
        verdict: unavailable?.kind === 'deny' ? unavailable : null,
        decidingStage: 'jev',
        note: 'Claude settings unreadable; classifier unavailable',
        status: 'failure',
        unavailable: true,
      },
    };
  }

  const rules = settings.rules;

  return {
    kind: 'pass',
    facts: {
      claudeSettings: settings,
      hasConfiguredDenies: rules.hard_deny.length > 0 || rules.soft_deny.length > 0,
    },
  };
}

const READ_ONLY_EXCEPTION = 'Read-only actions';

function classifyReadOnly(ctx: Readonly<StageContext>): StageDecision {
  const local: LocalVerdict = ctx.hasConfiguredDenies
    ? { kind: 'escalate' }
    : classifyLocally(ctx.request);

  if (local.kind === 'allow' && local.exception === READ_ONLY_EXCEPTION) {
    return { kind: 'decided', outcome: buildLocalAllow(local.exception) };
  }

  return { kind: 'pass', facts: { local } };
}

function buildLocalAllow(exception: string): ActionOutcome {
  return {
    verdict: { kind: 'allow' },
    decidingStage: 'local',
    note: `allowed by ${exception} (local)`,
    status: 'allow',
  };
}

async function classifyContainment(ctx: Readonly<StageContext>): Promise<StageDecision> {
  const host = ctx.options.runtime.host;
  const request = ctx.request;

  const checkout = await loadCheckoutFacts(request.cwd, host.env, {
    readCheckout: ctx.readCheckout,
  }).catch(() => null);

  const scope = await tryLoadTaskScope(
    {
      sessionID: request.sessionID,
      cwd: request.cwd,
      checkout,
      readCheckout: ctx.readCheckout,
      readTextFile: ctx.options.runtime.readTextFile,
    },
    ctx.config,
    host,
    ctx.options.stderr,
  );

  const containment = scope === null ? null : checkContainment(request, scope, host.scratchPaths);

  if (scope === null || containment === null) {
    return { kind: 'pass', facts: { checkout, scope } };
  }

  const note = `denied by the containment check: ${containment.findings.map((finding) => finding.target).join(', ')}`;

  const grant = await loadGrantEvidence(ctx, { containment, scope, checkout });

  if (grant === null) {
    return {
      kind: 'decided',
      outcome: {
        verdict: { kind: 'deny', rule: containment.rule, reason: containment.reason },
        decidingStage: 'containment',
        note,
        status: 'deny',
      },
    };
  }

  return { kind: 'pass', facts: { checkout, scope, grant: { evidence: grant, note } } };
}

async function tryLoadTaskScope(
  request: Readonly<{
    sessionID: string;
    cwd: string;
    checkout: CheckoutFacts | null;
    readCheckout: CheckoutReader;
    readTextFile: TextFileReader;
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

async function loadGrantEvidence(
  ctx: Readonly<StageContext>,
  facts: Readonly<{
    containment: ContainmentDeny;
    scope: OwnedScope;
    checkout: CheckoutFacts | null;
  }>,
): Promise<JudgeEvidence | null> {
  const containment = facts.containment;
  const judge = ctx.config.judge ?? null;
  const message = findCurrentDirectUserMessage(ctx.request.decisionContext?.lastDirectUserMessage);

  if (judge === null || message === null || ctx.options.localOnly === true) {
    return null;
  }

  const targets = findUserNamedGrant(containment.findings, message, {
    home: facts.scope.home,
    defaultBranch: facts.checkout?.head?.defaultBranch ?? null,
    protectedBranches: ctx.config.protectedBranches,
  });

  if (targets === null) {
    return null;
  }

  const text = await readContainmentRule().catch(() => null);

  if (text === null) {
    return null;
  }

  return {
    rule: { name: containment.rule, tier: 'soft', source: 'shipped', text },
    basis: 'matched',
    repositoryContext:
      facts.checkout === null
        ? null
        : buildRepositoryEvidence(facts.checkout, buildTaskScopeSummary(facts.scope)),
    containment: { reason: containment.reason, targets },
  };
}

function classifyRegenerable(ctx: Readonly<StageContext>): StageDecision {
  if (ctx.local.kind === 'allow' && ctx.scope !== null) {
    return { kind: 'decided', outcome: buildLocalAllow(ctx.local.exception) };
  }

  return { kind: 'pass' };
}

async function classifyEditBypass(ctx: Readonly<StageContext>): Promise<StageDecision> {
  if (ctx.hasConfiguredDenies || ctx.scope === null) {
    return { kind: 'pass' };
  }

  const edit = await tryClassifyEdit(ctx.request, ctx.scope, ctx.options.runtime.host, {
    readCheckout: ctx.readCheckout,
  });

  if (edit?.kind !== 'bypass') {
    return { kind: 'pass' };
  }

  return {
    kind: 'decided',
    outcome: {
      verdict: { kind: 'allow' },
      decidingStage: 'bypass',
      note: `allowed by the edit bypass: ${edit.target}`,
      status: 'allow',
    },
  };
}

async function classifyReplyChannel(ctx: Readonly<StageContext>): Promise<StageDecision> {
  const channel =
    ctx.hasConfiguredDenies || ctx.scope === null
      ? null
      : findReplyChannel(ctx.request.toolName, ctx.request.toolInput, ctx.scope.replyChannels);

  if (channel === null) {
    return { kind: 'pass' };
  }

  // The secret rule set adds about 10 ms to a CLI start, so only a message
  // through a reply channel loads it.
  const reply = await import('./bypass/classify-reply-message.ts');

  if (reply.classifyReplyMessage(ctx.request.toolInput).kind !== 'bypass') {
    return { kind: 'pass' };
  }

  return {
    kind: 'decided',
    outcome: {
      verdict: { kind: 'allow' },
      decidingStage: 'bypass',
      note: `allowed by the reply channel: ${channel.tool} to ${channel.recipient}`,
      status: 'allow',
    },
  };
}

function classifyLocalOnly(ctx: Readonly<StageContext>): StageDecision {
  if (ctx.options.localOnly !== true) {
    return { kind: 'pass' };
  }

  return {
    kind: 'decided',
    outcome: {
      verdict: null,
      decidingStage: 'local',
      note: `${ctx.request.toolName} needs the model tier, which this run skipped`,
      status: 'skipped',
    },
  };
}

async function classifyJev(ctx: Readonly<StageContext>): Promise<StageOutcome> {
  const outcome = await classifyWithJev(ctx.request, ctx.config, {
    ...ctx.options,
    taskScope: ctx.scope === null ? undefined : buildTaskScopeSummary(ctx.scope),
    claudeSettings: ctx.claudeSettings,
    checkout: ctx.checkout ?? undefined,
    readCheckout: ctx.readCheckout,
  });

  return {
    ...outcome,
    decidingStage: 'jev',
    status: outcome.diagnostics?.status ?? outcome.verdict?.kind ?? 'failure',
  };
}

async function classifyWithGrant(
  ctx: Readonly<StageContext>,
  decided: StageOutcome,
): Promise<ActionOutcome> {
  const { review, ...outcome } = decided;
  const grant = ctx.grant;
  const judge = ctx.config.judge ?? null;
  const denied = outcome.verdict?.kind === 'deny' ? (review ?? null) : null;
  const evidence = [grant?.evidence, denied ?? undefined].filter((entry) => entry !== undefined);

  if (judge === null || evidence.length === 0) {
    return outcome;
  }

  const judged = await classifyWithJudge(ctx.request, evidence, judge, {
    ...ctx.options,
    rulesPath: ctx.config.rulesPath,
    overturns: ctx.config.judgeOverturns ?? DEFAULT_JUDGE_OVERTURNS,
  });

  const granted = grant === null ? null : (judged[0] ?? null);
  const reviewed = denied === null ? null : (judged.at(-1) ?? null);
  const elapsedMs = judged[0]?.diagnostics.elapsedMs ?? 0;

  const judgedOutcome: ActionOutcome =
    reviewed === null
      ? outcome
      : {
          ...outcome,
          decidingStage: 'judge',
          note: `${outcome.note}; judge ${reviewed.status} (${String(elapsedMs)}ms)`,
          verdict: reviewed.verdict,
          status: reviewed.verdict.kind,
          judge: reviewed.diagnostics,
        };

  if (grant === null || granted === null) {
    return judgedOutcome;
  }

  if (granted.verdict.kind === 'deny') {
    return {
      ...(reviewed === null ? {} : { judge: reviewed.diagnostics }),
      ...(outcome.diagnostics === undefined ? {} : { diagnostics: outcome.diagnostics }),
      verdict: granted.verdict,
      decidingStage: 'containment',
      note: `${grant.note}; judge ${granted.status} (${String(elapsedMs)}ms)`,
      status: 'deny',
      grant: granted.diagnostics,
    };
  }

  return {
    ...judgedOutcome,
    note: `containment cleared by the judge for the targets the user named (${String(elapsedMs)}ms); ${judgedOutcome.note}`,
    grant: granted.diagnostics,
  };
}

async function tryReadDenialGuidance(): Promise<string | null> {
  try {
    return await readDenialGuidance();
  } catch {
    return null;
  }
}
