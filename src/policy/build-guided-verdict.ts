import type { Verdict } from '../request/types.ts';

// Every deny reason ends with the shipped guidance, whichever stage gave it,
// and still reaches the agent as a sentence when the guidance is unreadable.
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
