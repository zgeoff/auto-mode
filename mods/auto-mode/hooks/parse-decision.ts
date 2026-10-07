interface Decision {
  readonly decision: 'allow' | 'deny';
  readonly reason?: string;
}

export function parseDecision(stdout: string): Decision | null {
  let body: unknown;

  try {
    body = JSON.parse(stdout);
  } catch {
    return null;
  }

  if (typeof body !== 'object' || body === null || !('decision' in body)) {
    return null;
  }

  if (body.decision === 'allow') {
    return { decision: 'allow' };
  }

  if (
    body.decision === 'deny' &&
    'reason' in body &&
    typeof body.reason === 'string' &&
    body.reason.trim() !== ''
  ) {
    return { decision: 'deny', reason: body.reason };
  }

  return null;
}
