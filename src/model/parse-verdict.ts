import type { Verdict } from '../harness/types.ts';

const BLOCK = /<block>\s*(?<answer>yes|no)\s*<\/block>/i;
const RULE = /<rule>(?<rule>[^<]*)<\/rule>/i;
const REASON = /<reason>(?<reason>[^<]*)<\/reason>/i;

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
