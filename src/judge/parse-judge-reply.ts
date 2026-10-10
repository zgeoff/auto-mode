import type { JudgeReply } from './types.ts';

const VERDICT = /<verdict>\s*(?<verdict>[^<]*?)\s*<\/verdict>/giu;
const REASON = /<reason>(?<reason>[\s\S]*?)<\/reason>/giu;
const BASIS = /<basis>\s*(?<basis>[^<]*?)\s*<\/basis>/giu;

// One verdict tag and one non-empty reason tag, and an overturn names its one
// basis, or the reply is unreadable: a second tag could disagree with the first.
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

  if (verdict === 'confirm') {
    return { kind: 'confirm', reason };
  }

  const bases = [...text.matchAll(BASIS)].map((match) => match.groups?.['basis']?.toLowerCase());
  const [basis] = bases;

  if (bases.length !== 1 || (basis !== 'consent' && basis !== 'misread')) {
    return { kind: 'unreadable' };
  }

  return { kind: 'overturn', basis, reason };
}
