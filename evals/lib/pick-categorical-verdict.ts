import type { DecisionRule } from 'auto-mode';

interface CategoricalAnswer {
  readonly choice: string;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<string, number>>;
}

export interface CategoricalVerdict {
  readonly kind: 'allow' | 'deny' | 'ask';
  readonly rule: string | null;
}

const THRESHOLD = 0.8;

// A confident `none` allows and a confident rule denies; every other answer,
// `unclear` included, is an ask.
export function pickCategoricalVerdict(
  rules: Readonly<Record<string, DecisionRule>>,
  answer: Readonly<CategoricalAnswer> | undefined,
): CategoricalVerdict {
  if (
    answer === undefined ||
    answer.confidence < THRESHOLD ||
    (answer.probabilities[answer.choice] ?? 0) < THRESHOLD
  ) {
    return { kind: 'ask', rule: null };
  }

  if (answer.choice === 'none') {
    return { kind: 'allow', rule: null };
  }

  const rule = rules[answer.choice];

  return rule === undefined ? { kind: 'ask', rule: null } : { kind: 'deny', rule: rule.name };
}
