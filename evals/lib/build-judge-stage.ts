import {
  DEFAULT_JUDGE_OVERTURNS,
  MISREAD_CLEARABLE_BLOCK_PROBABILITY,
  buildDecisionRequest,
  buildJudgeMessage,
  buildJudgedVerdict,
  parseJudgeReplies,
} from 'auto-mode/eval';
import type { DecisionRule, JudgeReply } from 'auto-mode/eval';
import { JEV_STAGE } from './build-jev-stage.ts';
import { buildRecordedSampleOutcome } from './build-recorded-sample-outcome.ts';
import { classifyJevRecord } from './classify-jev-record.ts';
import type { Stage, StageContext, StageOutcome } from './define-experiment.ts';
import type { MeasurementCase } from './load-measurement-sets.ts';
import type { JudgeVerdict } from './parse-judge-verdict.ts';

export const JUDGE_STAGE = 'judge';
const UNREADABLE: JudgeReply = { kind: 'unreadable' };

export interface JudgeStageOptions {
  // The recorded judges reviewed the asks of the shipped reading, so a stage
  // reviewing another reading's denies has no recording to replay.
  readonly replaysRecording: boolean;

  readonly reviewsEveryJevDeny?: boolean;

  readonly alternatives?: readonly string[];
}

const REASON_TEXT_MAX_CHARS = 400;

export function buildJudgeStage(options: Readonly<JudgeStageOptions>): Stage<MeasurementCase> {
  const stage: Stage<MeasurementCase> = {
    name: JUDGE_STAGE,
    sends: true,
    reviews: JEV_STAGE,
    run: async (entry, context) => {
      const skipped = findSkip(context, options);

      if (skipped !== null) {
        return skipped;
      }

      const denied = findJevDeny(entry.case, context);

      if (denied === null) {
        return { status: 'skipped', reason: 'Jev named no rule to review.' };
      }

      if ('status' in denied) {
        return denied;
      }

      const reply = await context.sendJudge({
        user: buildJudgeMessage({
          denies: [{ rule: denied.rule, basis: denied.basis, misreadClears: denied.misreadClears }],
          action: {
            tool: entry.case.action.toolName,
            cwd: entry.case.action.cwd,
            input: entry.case.action.toolInput,
          },
          lastUserMessage: entry.case.lastUserMessage,
          repositoryContext: entry.case.repository,
        }),
      });

      const [parsed = UNREADABLE] = parseJudgeReplies(reply.text, [denied.rule.name]);

      const judged = buildJudgedVerdict(denied.rule, denied.basis, parsed, {
        overturns: DEFAULT_JUDGE_OVERTURNS,
        misreadClears: denied.misreadClears,
      });

      if (judged.status === 'failed') {
        return { status: 'not-scorable', reason: 'judge-unreadable' };
      }

      const basis = judged.overturnBasis === null ? '' : ` (${judged.overturnBasis})`;
      const text = parsed.kind === 'unreadable' ? '' : parsed.reason.replaceAll(/\s+/gu, ' ');

      return {
        status: 'scored',
        verdict: judged.verdict.kind,
        pBlock: null,
        reason: `${judged.status}${basis}: ${denied.rule.name} — ${text.slice(0, REASON_TEXT_MAX_CHARS)}`,
      };
    },
  };

  return options.replaysRecording ? { ...stage, replay: buildJudgeReplay(options) } : stage;
}

function findSkip(
  context: Readonly<StageContext>,
  options: Readonly<JudgeStageOptions>,
): StageOutcome | null {
  const jev = context.previous.find((record) => record.stage === JEV_STAGE);

  if (jev?.status !== 'scored' || jev.verdict !== 'deny') {
    return { status: 'skipped', reason: 'Jev did not deny this sample.' };
  }

  if (options.reviewsEveryJevDeny === true) {
    return null;
  }

  const alternatives = options.alternatives ?? [];

  const other = context.previous.find(
    (record) =>
      record.stage !== JEV_STAGE &&
      !alternatives.includes(record.stage) &&
      record.status === 'scored' &&
      record.verdict === 'deny',
  );

  return other === undefined
    ? null
    : { status: 'skipped', reason: `The ${other.stage} stage denied this sample first.` };
}

const JEV_DENY = /^(?:deny|all-allow-ask): (?<rule>.+)$/u;

interface JevDeny {
  readonly rule: DecisionRule;
  readonly basis: 'matched' | 'unresolved';
  readonly misreadClears: boolean;
}

// The Jev record keeps only the denied rule and its block probability, the
// highest, so a choice of block passes one half and a clearable hard deny is
// read as the only rule that blocks.
function findJevDeny(
  entry: Readonly<MeasurementCase>,
  context: Readonly<StageContext>,
): JevDeny | StageOutcome | null {
  const jev = context.previous.find((record) => record.stage === JEV_STAGE);

  const name =
    jev?.reason === null || jev === undefined
      ? undefined
      : JEV_DENY.exec(jev.reason)?.groups?.['rule'];

  if (jev === undefined || name === undefined) {
    return null;
  }

  const request = buildDecisionRequest(entry.action, context.policy, {
    configuredRules: entry.configuredRules ?? context.configuredRules,
    lastUserMessage: entry.lastUserMessage,
    rulesSource: 'shipped',
    repositoryContext: entry.repository,
    mcpServers: entry.mcpServers,
  });

  const rule = Object.values(request.rules).find((candidate) => candidate.name === name);

  if (rule === undefined) {
    return { status: 'not-scorable', reason: 'jev-rule-not-shipped' };
  }

  const pBlock = jev.pBlock ?? 1;

  return {
    rule,
    basis: pBlock > 0.5 ? 'matched' : 'unresolved',
    misreadClears:
      rule.tier === 'hard' &&
      rule.source !== 'configured' &&
      pBlock <= MISREAD_CLEARABLE_BLOCK_PROBABILITY,
  };
}

function buildJudgeReplay(
  options: Readonly<JudgeStageOptions>,
): NonNullable<Stage<MeasurementCase>['replay']> {
  return (entry, context) => {
    const skipped = findRecordedSkip(entry.case, context, options);

    if (skipped !== null) {
      return Promise.resolve(skipped);
    }

    const recorded = entry.case.recorded[JUDGE_STAGE]?.[context.sample];

    if (recorded === undefined) {
      return Promise.resolve({
        status: 'skipped',
        reason: `The recording holds no judge sample ${context.sample}.`,
      });
    }

    if (recorded.kind === 'sample') {
      return Promise.resolve(buildRecordedSampleOutcome(recorded.record, recorded.model));
    }

    if (recorded.kind !== 'judge') {
      throw new Error(`The judge recording of ${entry.key} holds a Jev answer.`);
    }

    const record = recorded.record;
    const answer = { answer: record, latencyMs: record.elapsedMs, model: recorded.model };

    if (record.verdict === 'failure') {
      return Promise.resolve({
        status: 'not-scorable',
        reason: `judge-${record.failureReason ?? 'unknown'}`,
        recorded: answer,
      });
    }

    const verdict: JudgeVerdict =
      record.verdict === 'block' ? { kind: 'block', rule: record.rule } : { kind: record.verdict };

    return Promise.resolve({ ...buildOutcome(verdict), recorded: answer });
  };
}

// The recorded judges were sent only the asks whose every answer chose allow,
// so a replay judges only those of the denies.
function findRecordedSkip(
  entry: Readonly<MeasurementCase>,
  context: Readonly<StageContext>,
  options: Readonly<JudgeStageOptions>,
): StageOutcome | null {
  const skipped = findSkip(context, options);

  if (skipped !== null || entry.recorded[JUDGE_STAGE]?.[context.sample]?.kind === 'sample') {
    return skipped;
  }

  const recorded = entry.recorded[JEV_STAGE]?.[context.sample];
  const jev = recorded?.kind === 'jev-record' ? classifyJevRecord(recorded.record) : null;

  return jev?.kind === 'all-allow-ask'
    ? null
    : {
        status: 'skipped',
        reason: 'The recording judged only asks whose every answer chose allow.',
      };
}

function buildOutcome(verdict: Readonly<JudgeVerdict>): StageOutcome {
  if (verdict.kind === 'unreadable') {
    return { status: 'not-scorable', reason: 'judge-unreadable' };
  }

  return verdict.kind === 'allow'
    ? { status: 'scored', verdict: 'allow', pBlock: null, reason: null }
    : { status: 'scored', verdict: 'deny', pBlock: null, reason: verdict.rule };
}
