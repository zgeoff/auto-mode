import type { JevClass } from './classify-live-jev-answers.ts';
import type { JevReport } from './jev-report-schema.ts';

type JevRecord = JevReport['records'][number];

// A recorded Jev report keeps only the answers short of a confident allow.
export function classifyJevRecord(record: Readonly<JevRecord>): JevClass | null {
  if (record.status === 'failure') {
    return null;
  }

  const [held] = record.contributors.toSorted((left, right) => right.block - left.block);
  const pBlock = Math.max(held?.block ?? 0, ...Object.values(record.blockProbabilities ?? {}));

  if (record.status === 'allow') {
    return { kind: 'allow', rule: null, pBlock };
  }

  const rule = record.rule ?? held?.rule ?? 'unnamed';

  const isAllAllow =
    record.status === 'ask' && record.contributors.every((answer) => answer.choice === 'allow');

  return { kind: isAllAllow ? 'all-allow-ask' : 'deny', rule, pBlock };
}
