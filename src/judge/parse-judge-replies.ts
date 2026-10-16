import { judgeReviewsSchema } from './judge-reviews-schema.ts';
import { parseJudgeReply } from './parse-judge-reply.ts';
import type { JudgeReply } from './types.ts';

const JSON_FENCE = /^```(?:json)?\s*(?<body>[\s\S]*?)\s*```$/u;

// A list that skips, adds or reorders a rule could pin one rule's verdict on
// another, so it leaves every review unreadable. A single deny also reads the
// one-verdict reply that the recorded evaluation answers hold.
export function parseJudgeReplies(text: string, rules: readonly string[]): readonly JudgeReply[] {
  const unreadable = rules.map((): JudgeReply => ({ kind: 'unreadable' }));
  const trimmed = text.trim();
  const body = JSON_FENCE.exec(trimmed)?.groups?.['body'] ?? trimmed;

  const parsed = judgeReviewsSchema.safeParse(
    parseJSON(body) ?? parseJSON(findTrailingReviews(body)),
  );

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

const REVIEWS_START = /\{\s*"reviews"\s*:/u;
const VERDICT_TAG = /<\/?(?:verdict|basis|reason)>/u;

// A judge with no tools still opens some replies with a stray tool-call
// fragment. Only an object that ends the reply, after no verdict tag, is the
// answer, so a reviews object quoted inside a tagged reason never is.
function findTrailingReviews(text: string): string {
  const start = text.search(REVIEWS_START);

  return start === -1 || VERDICT_TAG.test(text.slice(0, start)) ? '' : text.slice(start);
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
