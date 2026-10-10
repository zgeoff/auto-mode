import type { DecisionRule } from '../model/types.ts';
import type { DenyBasis } from '../policy/build-deny-reason.ts';
import { buildDenyReason } from '../policy/build-deny-reason.ts';
import type { Verdict } from '../request/types.ts';
import type { JudgeReply, JudgeStatus } from './types.ts';

export interface JudgedVerdict {
  readonly verdict: Verdict;
  readonly status: JudgeStatus;
}

export const JUDGE_REASON_MAX_CHARS = 600;

// A hard rule never clears, so an overturn of one keeps the deny, and its reason
// argues for the allow, so the agent reads the template reason instead.
export function buildJudgedVerdict(
  rule: Pick<DecisionRule, 'name' | 'tier' | 'source'>,
  basis: DenyBasis,
  reply: Readonly<JudgeReply> | null,
): JudgedVerdict {
  const template: Verdict = { kind: 'deny', rule: rule.name, reason: buildDenyReason(rule, basis) };

  if (reply === null || reply.kind === 'unreadable') {
    return { verdict: template, status: 'failed' };
  }

  if (reply.kind === 'overturn') {
    return rule.tier === 'hard'
      ? { verdict: template, status: 'held' }
      : { verdict: { kind: 'allow' }, status: 'overturned' };
  }

  return {
    verdict: {
      kind: 'deny',
      rule: rule.name,
      reason: `The reviewer confirmed the ${rule.name} deny: ${formatJudgeText(reply.reason)}`,
    },
    status: 'confirmed',
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
