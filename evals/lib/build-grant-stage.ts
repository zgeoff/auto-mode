import {
  buildJudgeMessage,
  buildJudgedVerdict,
  checkContainment,
  findUserNamedGrant,
  parseJudgeReply,
  readContainmentRule,
} from 'auto-mode/eval';
import { CONTAINMENT_STAGE } from './build-containment-stage.ts';
import { buildCwdTaskScope } from './build-cwd-task-scope.ts';
import { buildRecordedSampleOutcome } from './build-recorded-sample-outcome.ts';
import type { LabelledCase, Stage, StageContext, StageOutcome } from './define-experiment.ts';
import type { MeasurementCase } from './load-measurement-sets.ts';

export const GRANT_STAGE = 'grant';
const REASON_TEXT_MAX_CHARS = 400;

// The judge reviews a containment deny only when the case's user message names
// every target, as the product does; it reads the shipped containment rule,
// judge request, reply parser and verdict, and only consent clears the deny.
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
          rule: review.rule,
          basis: 'matched',
          action: {
            tool: entry.case.action.toolName,
            cwd: entry.case.action.cwd,
            input: entry.case.action.toolInput,
          },
          containment: review.containment,
          lastUserMessage: entry.case.lastUserMessage,
          repositoryContext: entry.case.repository,
        }),
      });

      const parsed = parseJudgeReply(reply.text);

      const judged = buildJudgedVerdict(
        review.rule,
        'matched',
        parsed,
        'consent',
        review.containment.reason,
      );

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

// The containment check and the name match are deterministic, so a replay
// runs them again and reads a recording only for a review the judge made.
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

  const scope = await buildCwdTaskScope(action.cwd, entry.case.repository);

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
