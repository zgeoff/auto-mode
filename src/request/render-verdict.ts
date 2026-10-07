import { match } from 'ts-pattern';
import type { Verdict } from './types.ts';

export function renderVerdict(verdict: Verdict): string | null {
  return match(verdict)
    .with({ kind: 'ask' }, () => null)
    .with({ kind: 'allow' }, () => JSON.stringify({ decision: 'allow' }))
    .with({ kind: 'deny' }, (denied) =>
      JSON.stringify({ decision: 'deny', reason: `[${denied.rule}] ${denied.reason}` }),
    )
    .exhaustive();
}
