import { JEV_STAGE } from './build-jev-stage.ts';
import { classifyJevRecord } from './classify-jev-record.ts';
import type { Stage, StageContext, StageOutcome } from './define-experiment.ts';
import type { MeasurementCase } from './load-measurement-sets.ts';
import { parseJudgeVerdict } from './parse-judge-verdict.ts';
import type { JudgeVerdict } from './parse-judge-verdict.ts';

export const JUDGE_STAGE = 'judge';

export interface JudgeStageOptions {
  readonly scope: 'jev-denies' | 'every-sample';

  // The recorded judges reviewed the asks of the shipped reading, so a stage
  // reviewing another reading's denies has no recording to replay.
  readonly replaysRecording: boolean;
}

// The judge overturns or confirms a Jev deny no other stage made, so a
// containment deny stays final. It fails closed: an unreadable reply or a failed
// request is not scorable, never an allow.
export function buildJudgeStage(options: Readonly<JudgeStageOptions>): Stage<MeasurementCase> {
  const scope = options.scope;

  const stage: Stage<MeasurementCase> = {
    name: JUDGE_STAGE,
    sends: true,
    ...(scope === 'jev-denies' ? { reviews: JEV_STAGE } : {}),
    run: async (entry, context) => {
      const skipped = scope === 'jev-denies' ? findSkip(context) : null;

      if (skipped !== null) {
        return skipped;
      }

      try {
        const reply = await context.sendJudge({
          action: entry.case.action,
          lastUserMessage: entry.case.lastUserMessage,
          repository: entry.case.repository,
        });

        return buildOutcome(parseJudgeVerdict(reply.text));
      } catch (error) {
        const isTimeout =
          error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');

        return { status: 'not-scorable', reason: isTimeout ? 'judge-timeout' : 'judge-request' };
      }
    },
  };

  return options.replaysRecording ? { ...stage, replay: buildJudgeReplay(scope) } : stage;
}

function buildJudgeReplay(
  scope: JudgeStageOptions['scope'],
): NonNullable<Stage<MeasurementCase>['replay']> {
  return (entry, context) => {
    const skipped = scope === 'jev-denies' ? findRecordedSkip(entry.case, context) : null;

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

function findSkip(context: Readonly<StageContext>): StageOutcome | null {
  const jev = context.previous.find((record) => record.stage === JEV_STAGE);

  if (jev?.status !== 'scored' || jev.verdict !== 'deny') {
    return { status: 'skipped', reason: 'Jev did not deny this sample.' };
  }

  const other = context.previous.find(
    (record) =>
      record.stage !== JEV_STAGE && record.status === 'scored' && record.verdict === 'deny',
  );

  return other === undefined
    ? null
    : { status: 'skipped', reason: `The ${other.stage} stage denied this sample first.` };
}

// The recorded judges were sent only the asks whose every answer chose allow,
// so a replay judges only those of the denies.
function findRecordedSkip(
  entry: Readonly<MeasurementCase>,
  context: Readonly<StageContext>,
): StageOutcome | null {
  const skipped = findSkip(context);

  if (skipped !== null) {
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
