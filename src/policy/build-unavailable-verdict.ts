import type { Config } from '../config/config.ts';
import type { Verdict } from '../request/types.ts';

export function buildUnavailableVerdict(
  onFailure: Config['onFailure'],
  reason: string,
): Verdict | null {
  return onFailure === 'deny' ? { kind: 'deny', rule: 'Classifier Unavailable', reason } : null;
}
