import { match } from 'ts-pattern';
import type { ModVerdict } from '../../mods/auto-mode/contract/types.ts';
import type { Verdict } from './types.ts';

export function renderVerdict(verdict: Verdict): string {
  const rendered = match(verdict)
    .returnType<ModVerdict>()
    .with({ kind: 'allow' }, () => ({ decision: 'allow' }))
    .with({ kind: 'deny' }, (denied) => ({
      decision: 'deny',
      reason: `[${denied.rule}] ${denied.reason}`,
    }))
    .exhaustive();

  return JSON.stringify(rendered);
}
