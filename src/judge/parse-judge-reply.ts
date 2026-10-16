import { judgeVerdictSchema } from './judge-verdict-schema.ts';
import type { JudgeReply } from './types.ts';

const VERDICT = /<verdict>\s*(?<verdict>[^<]*?)\s*<\/verdict>/giu;
const REASON = /<reason>(?<reason>[\s\S]*?)<\/reason>/giu;
const BASIS = /<basis>\s*(?<basis>[^<]*?)\s*<\/basis>/giu;
const JSON_FENCE = /^```(?:json)?\s*(?<body>[\s\S]*?)\s*```$/u;

// The judge answers one JSON verdict. The recorded replies the evaluations
// replay predate it and hold tags, so a reply that is no JSON object is read as
// tags instead.
export function parseJudgeReply(text: string): JudgeReply {
  const trimmed = text.trim();
  const body = JSON_FENCE.exec(trimmed)?.groups?.['body'] ?? trimmed;

  return body.startsWith('{') ? parseJSONReply(body) : parseTaggedReply(text);
}

// An overturn names its basis, so one without a basis is unreadable.
function parseJSONReply(body: string): JudgeReply {
  let value: unknown;

  try {
    value = JSON.parse(body);
  } catch {
    return { kind: 'unreadable' };
  }

  const parsed = judgeVerdictSchema.safeParse(value);

  if (!parsed.success) {
    return { kind: 'unreadable' };
  }

  const answer = parsed.data;

  if (answer.verdict === 'confirm') {
    return { kind: 'confirm', reason: answer.reason };
  }

  return answer.basis === null
    ? { kind: 'unreadable' }
    : { kind: 'overturn', basis: answer.basis, reason: answer.reason };
}

// One verdict tag and one non-empty reason tag, and an overturn names its one
// basis, or the reply is unreadable: a second tag could disagree with the first.
function parseTaggedReply(text: string): JudgeReply {
  const verdictMatches = [...text.matchAll(VERDICT)];
  const verdicts = verdictMatches.map((match) => match.groups?.['verdict']?.toLowerCase());
  const reasons = [...text.matchAll(REASON)].map((match) => match.groups?.['reason']?.trim());
  const [verdictMatch] = verdictMatches;
  const [verdict] = verdicts;
  const [reason] = reasons;

  if (
    verdictMatch !== undefined &&
    verdicts.length === 1 &&
    verdict === 'confirm' &&
    reasons.length === 0
  ) {
    const unclosedReason = findUnclosedReason(text, verdictMatch.index + verdictMatch[0].length);

    return unclosedReason === undefined
      ? { kind: 'unreadable' }
      : { kind: 'confirm', reason: unclosedReason };
  }

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

const REASON_OPENING = /<reason>/giu;
const REASON_CLOSING = /<\/reason>/iu;

// A fallback model sometimes ends a tagged reply inside its reason, before the
// closing tag. A confirm keeps the deny,
// so this reads only a confirm's reason; an unclosed overturn stays unreadable.
function findUnclosedReason(text: string, verdictEnd: number): string | undefined {
  const openings = [...text.matchAll(REASON_OPENING)];
  const [opening] = openings;

  if (
    openings.length !== 1 ||
    opening === undefined ||
    opening.index < verdictEnd ||
    REASON_CLOSING.test(text)
  ) {
    return undefined;
  }

  const reason = text.slice(opening.index + opening[0].length).trim();

  return reason === '' ? undefined : reason;
}
