import type { JudgeReply } from './types.ts';

const VERDICT = /<verdict>\s*(?<verdict>[^<]*?)\s*<\/verdict>/giu;
const REASON = /<reason>(?<reason>[\s\S]*?)<\/reason>/giu;

// One verdict tag and one non-empty reason tag, or the reply is unreadable:
// a second verdict could disagree with the first, and the parser picks neither.
export function parseJudgeReply(text: string): JudgeReply {
  const verdicts = [...text.matchAll(VERDICT)].map((match) =>
    match.groups?.['verdict']?.toLowerCase(),
  );

  const reasons = [...text.matchAll(REASON)].map((match) => match.groups?.['reason']?.trim());
  const [verdict] = verdicts;
  const [reason] = reasons;

  if (
    verdicts.length !== 1 ||
    reasons.length !== 1 ||
    reason === undefined ||
    reason === '' ||
    (verdict !== 'confirm' && verdict !== 'overturn')
  ) {
    return { kind: 'unreadable' };
  }

  return { kind: verdict, reason };
}
