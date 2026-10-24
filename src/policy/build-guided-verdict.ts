import type { Verdict } from '../request/types.ts';

export function buildGuidedVerdict(verdict: Readonly<Verdict>, guidance: string | null): Verdict {
  if (verdict.kind !== 'deny') {
    return verdict;
  }

  const sentence = /[.!?]$/u.test(verdict.reason) ? verdict.reason : `${verdict.reason}.`;

  return {
    kind: 'deny',
    rule: verdict.rule,
    reason: guidance === null ? sentence : `${sentence} ${guidance}`,
  };
}
