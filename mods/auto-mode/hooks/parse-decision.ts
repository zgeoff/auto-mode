import type { ModVerdict } from '../contract/types.ts';

// The CLI ships with this mod, so any other shape is a mismatched or broken CLI,
// and only an exact verdict may replace the prompt.
export function parseDecision(stdout: string): ModVerdict | null {
  let body: unknown;

  try {
    body = JSON.parse(stdout);
  } catch {
    return null;
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }

  const keys = Object.keys(body).toSorted().join(',');

  if (keys === 'decision' && 'decision' in body && body.decision === 'allow') {
    return { decision: 'allow' };
  }

  if (
    keys === 'decision,reason' &&
    'decision' in body &&
    body.decision === 'deny' &&
    'reason' in body &&
    typeof body.reason === 'string' &&
    body.reason.trim() !== ''
  ) {
    return { decision: 'deny', reason: body.reason };
  }

  return null;
}
