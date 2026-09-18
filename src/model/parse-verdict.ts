import type { Verdict } from '../harness/types.ts';

const BLOCK = /<block>\s*(yes|no)\s*<\/block>/i;
const RULE = /<rule>([^<]*)<\/rule>/i;
const REASON = /<reason>([^<]*)<\/reason>/i;

/**
 * Reads the classifier's answer.
 *
 * Every ambiguity resolves to allow, on the policy's own reasoning: a block
 * nobody can name is a false positive, and a false positive costs more than the
 * action it stopped. A model that says `yes` but names no rule has not made a
 * case, so there is nothing to show the user and nothing to appeal.
 */
export function parseModelVerdict(text: string): Verdict {
  const block = BLOCK.exec(text);

  if (block === null || block[1]?.toLowerCase() !== 'yes') {
    return { kind: 'allow' };
  }

  const rule = RULE.exec(text)?.[1]?.trim();

  if (rule === undefined || rule === '') {
    return { kind: 'allow' };
  }

  const reason = REASON.exec(text)?.[1]?.trim();

  // The reason is written to start with the rule name in brackets, and the
  // renderer adds that prefix, so strip it rather than print it twice.
  const stripped = reason?.replace(/^\[[^\]]*\]\s*/, '') ?? '';

  return {
    kind: 'deny',
    rule,
    reason: stripped === '' ? 'the policy blocks this action.' : stripped,
  };
}
