import type { DecisionRequest, DecisionRule } from 'auto-mode';

// A live two-choice result and a recorded three-choice one both fit this shape.
export interface ScoredDecisionResult {
  readonly answers: Readonly<
    Record<
      string,
      {
        readonly choice: string;
        readonly confidence: number;
        readonly probabilities: Readonly<{ allow: number; block: number }>;
      }
    >
  >;
}

type DecisionClass =
  | { readonly kind: 'allow' }
  | { readonly kind: 'block'; readonly rule: DecisionRule }
  | { readonly kind: 'uncertain'; readonly rule: DecisionRule };

export function classifyRecordedAnswers(
  request: DecisionRequest,
  result: ScoredDecisionResult,
  minConfidence: number,
): DecisionClass {
  const entries = Object.entries(request.rules).map(([id, rule]) => {
    const answer = result.answers[id];

    if (answer === undefined) {
      throw new Error('Decision answer missing');
    }

    return { rule, answer };
  });

  for (const tier of ['hard', 'soft'] as const) {
    for (const entry of entries) {
      if (
        entry.rule.tier === tier &&
        entry.answer.choice === 'block' &&
        entry.answer.confidence >= minConfidence &&
        entry.answer.probabilities.block >= minConfidence
      ) {
        return { kind: 'block', rule: entry.rule };
      }
    }
  }

  let uncertain: (typeof entries)[number] | null = null;

  for (const entry of entries) {
    const answer = entry.answer;

    const isConfidentAllow =
      answer.choice === 'allow' &&
      answer.confidence >= minConfidence &&
      answer.probabilities.allow >= minConfidence;

    if (
      !isConfidentAllow &&
      (uncertain === null || answer.probabilities.block > uncertain.answer.probabilities.block)
    ) {
      uncertain = entry;
    }
  }

  return uncertain === null ? { kind: 'allow' } : { kind: 'uncertain', rule: uncertain.rule };
}
