export type JudgeVerdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'block'; readonly rule: string | null }
  | { readonly kind: 'unreadable' };

const BLOCK_TAG = /<block>\s*(?<answer>[^<]*?)\s*<\/block>/gi;
const RULE = /<rule>(?<rule>[^<]*)<\/rule>/i;

// The Messages parser reads a missing block tag as allow. A judge that may only
// promote must give an explicit allow instead, so every tag it wrote must say no.
export function parseJudgeVerdict(text: string): JudgeVerdict {
  const answers = [...text.matchAll(BLOCK_TAG)].map((match) => match[1]?.toLowerCase());

  if (answers.length === 0 || answers.some((answer) => answer !== 'yes' && answer !== 'no')) {
    return { kind: 'unreadable' };
  }

  if (answers.includes('yes')) {
    const rule = RULE.exec(text)?.[1]?.trim();

    return { kind: 'block', rule: rule === undefined || rule === '' ? null : rule };
  }

  return { kind: 'allow' };
}
