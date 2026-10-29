import {
  buildJudgeMessage,
  buildJudgedVerdict,
  checkContainment,
  findUserNamedGrant,
  parseJudgeReplies,
  readContainmentRule,
} from 'auto-mode/eval';
import type { JudgeReply } from 'auto-mode/eval';
import { CONTAINMENT_STAGE } from './build-containment-stage.ts';
import { buildRecordedSampleOutcome } from './build-recorded-sample-outcome.ts';
import type { LabelledCase, Stage, StageContext, StageOutcome } from './define-experiment.ts';
import type { MeasurementCase } from './load-measurement-sets.ts';
import { readCwdTaskScope } from './read-cwd-task-scope.ts';

export const GRANT_STAGE = 'grant';
const REASON_TEXT_MAX_CHARS = 400;
const UNREADABLE: JudgeReply = { kind: 'unreadable' };

export function buildGrantStage(): Stage<MeasurementCase> {
  return {
    name: GRANT_STAGE,
    sends: true,
    reviews: CONTAINMENT_STAGE,
    run: async (entry, context) => {
      const review = await planGrantReview(entry, context);

      if (review.kind === 'outcome') {
        return review.outcome;
      }

      const reply = await context.sendJudge({
        user: buildJudgeMessage({
          denies: [{ rule: review.rule, basis: 'matched', containment: review.containment }],
          action: {
            tool: entry.case.action.toolName,
            cwd: entry.case.action.cwd,
            input: entry.case.action.toolInput,
          },
          lastUserMessage: entry.case.lastUserMessage,
          repositoryContext: entry.case.repository,
        }),
      });

      const [parsed = UNREADABLE] = parseJudgeReplies(reply.text, [review.rule.name]);

      const judged = buildJudgedVerdict(review.rule, 'matched', parsed, {
        overturns: 'consent',
        heldReason: review.containment.reason,
        hasUserMessage: entry.case.lastUserMessage !== null,
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
        reason: `${judged.status}${basis}: ${text.slice(0, REASON_TEXT_MAX_CHARS)}`,
      };
    },
    replay: async (entry, context) => {
      const review = await planGrantReview(entry, context);

      if (review.kind === 'outcome') {
        return review.outcome;
      }

      const recorded = entry.case.recorded[GRANT_STAGE]?.[context.sample];

      if (recorded?.kind !== 'sample') {
        return {
          status: 'skipped',
          reason: `The recording holds no grant sample ${context.sample}.`,
        };
      }

      return buildRecordedSampleOutcome(recorded.record, recorded.model);
    },
  };
}

type GrantReview =
  | { readonly kind: 'outcome'; readonly outcome: StageOutcome }
  | {
      readonly kind: 'review';
      readonly rule: {
        readonly name: string;
        readonly tier: 'soft';
        readonly source: 'shipped';
        readonly text: string;
      };
      readonly containment: {
        readonly reason: string;
        readonly targets: NonNullable<ReturnType<typeof findUserNamedGrant>>;
      };
    };

async function planGrantReview(
  entry: Readonly<LabelledCase<MeasurementCase>>,
  context: Readonly<StageContext>,
): Promise<GrantReview> {
  const containment = context.previous.find((record) => record.stage === CONTAINMENT_STAGE);

  if (containment?.status !== 'scored' || containment.verdict !== 'deny') {
    return {
      kind: 'outcome',
      outcome: { status: 'skipped', reason: 'The containment check did not deny this sample.' },
    };
  }

  const action = entry.case.action;

  const scope = await readCwdTaskScope(action.cwd, entry.case.repository);

  const deny = checkContainment(action, scope);
  const message = entry.case.lastUserMessage;

  const targets =
    deny === null || message === null
      ? null
      : findUserNamedGrant(deny.findings, message, {
          home: scope.home,
          defaultBranch: entry.case.repository.defaultBranch,
        });

  if (deny === null || targets === null) {
    return {
      kind: 'outcome',
      outcome: {
        status: 'scored',
        verdict: 'deny',
        pBlock: null,
        reason: 'unnamed: the user message names no grantable target of every finding',
      },
    };
  }

  return {
    kind: 'review',
    rule: {
      name: deny.rule,
      tier: 'soft',
      source: 'shipped',
      text: await readContainmentRule(),
    },
    containment: { reason: deny.reason, targets },
  };
}
