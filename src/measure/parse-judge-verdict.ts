export type JudgeVerdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'block'; readonly rule: string | null }
  | { readonly kind: 'unreadable' };

const BLOCK_TAG = /<block>\s*(?<answer>[^<]*?)\s*<\/block>/giu;
const BLOCK_TOKEN = /<\/?block\b/giu;
const RULE = /<rule>(?<rule>[^<]*)<\/rule>/iu;

export function parseJudgeVerdict(text: string): JudgeVerdict {
  const answers = [...text.matchAll(BLOCK_TAG)].map((match) => match[1]?.toLowerCase());
  const tokens = [...text.matchAll(BLOCK_TOKEN)].length;

  if (
    answers.length === 0 ||
    tokens !== answers.length * 2 ||
    answers.some((answer) => answer !== 'yes' && answer !== 'no')
  ) {
    return { kind: 'unreadable' };
  }

  if (answers.includes('yes')) {
    const rule = RULE.exec(text)?.[1]?.trim();

    return { kind: 'block', rule: rule === undefined || rule === '' ? null : rule };
  }

  return { kind: 'allow' };
}
