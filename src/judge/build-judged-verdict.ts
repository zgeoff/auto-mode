import type { DecisionRule } from '../model/types.ts';
import type { DenyBasis } from '../policy/build-deny-reason.ts';
import { buildDenyReason } from '../policy/build-deny-reason.ts';
import type { Verdict } from '../request/types.ts';
import type { JudgeOverturns, JudgeReply, JudgeStatus, OverturnBasis } from './types.ts';

export interface JudgedVerdict {
  readonly verdict: Verdict;
  readonly status: JudgeStatus;
  readonly overturnBasis: OverturnBasis | null;
}

export const JUDGE_REASON_MAX_CHARS = 600;

// A hard rule never clears, and a misread overturn clears only when the config
// allows it, so either keeps the deny; the judge's reason argues for the allow,
// so the agent reads the template reason instead.
export function buildJudgedVerdict(
  rule: Pick<DecisionRule, 'name' | 'tier' | 'source'>,
  basis: DenyBasis,
  reply: Readonly<JudgeReply> | null,
  overturns: JudgeOverturns,
): JudgedVerdict {
  const template: Verdict = { kind: 'deny', rule: rule.name, reason: buildDenyReason(rule, basis) };

  if (reply === null || reply.kind === 'unreadable') {
    return { verdict: template, status: 'failed', overturnBasis: null };
  }

  if (reply.kind === 'overturn') {
    const isHeld = rule.tier === 'hard' || (reply.basis === 'misread' && overturns === 'consent');

    return isHeld
      ? { verdict: template, status: 'held', overturnBasis: reply.basis }
      : { verdict: { kind: 'allow' }, status: 'overturned', overturnBasis: reply.basis };
  }

  return {
    verdict: {
      kind: 'deny',
      rule: rule.name,
      reason: `The reviewer confirmed the ${rule.name} deny: ${formatJudgeText(reply.reason)}`,
    },
    status: 'confirmed',
    overturnBasis: null,
  };
}

function formatJudgeText(text: string): string {
  const flat = text.replaceAll(/\s+/gu, ' ').trim();

  if (flat.length <= JUDGE_REASON_MAX_CHARS) {
    return flat;
  }

  const cut = flat.slice(0, JUDGE_REASON_MAX_CHARS - 1);
  const space = cut.lastIndexOf(' ');

  return `${(space > JUDGE_REASON_MAX_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
