import { judgeReviewsSchema } from './judge-reviews-schema.ts';
import { parseJudgeReply } from './parse-judge-reply.ts';
import type { JudgeReply } from './types.ts';

const JSON_FENCE = /^```(?:json)?\s*(?<body>[\s\S]*?)\s*```$/u;

export function parseJudgeReplies(text: string, rules: readonly string[]): readonly JudgeReply[] {
  const unreadable = rules.map((): JudgeReply => ({ kind: 'unreadable' }));
  const trimmed = text.trim();
  const body = JSON_FENCE.exec(trimmed)?.groups?.['body'] ?? trimmed;

  const parsed = judgeReviewsSchema.safeParse(
    parseJSON(body) ?? parseJSON(getTrailingReviews(body)),
  );

  // The recorded evaluation answers hold one-verdict replies.
  if (!parsed.success) {
    return rules.length === 1 ? [parseJudgeReply(text)] : unreadable;
  }

  const reviews = parsed.data.reviews;

  if (
    reviews.length !== rules.length ||
    reviews.some((review, index) => review.rule !== rules[index])
  ) {
    return unreadable;
  }

  return reviews.map((review): JudgeReply => {
    if (review.verdict === 'confirm') {
      return { kind: 'confirm', reason: review.reason };
    }

    return review.basis === null
      ? { kind: 'unreadable' }
      : { kind: 'overturn', basis: review.basis, reason: review.reason };
  });
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const REVIEWS_START = /\{\s*"reviews"\s*:/u;
const VERDICT_TAG = /<\s*\/?\s*(?:verdict|basis|reason)\b[^>]*>/iu;
const CLOSING_FENCE = /\s*```\s*$/u;

// On a long case the judge often writes prose or a stray tool-call fragment
// before its answer.
function getTrailingReviews(text: string): string {
  const body = text.replace(CLOSING_FENCE, '');
  const start = body.search(REVIEWS_START);

  return start === -1 || VERDICT_TAG.test(body.slice(0, start)) ? '' : body.slice(start);
}
