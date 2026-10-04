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

  if (typeof body !== 'object' || body === null || !('hookSpecificOutput' in body)) {
    return null;
  }

  const output = body.hookSpecificOutput;

  if (
    typeof output !== 'object' ||
    output === null ||
    !('hookEventName' in output) ||
    output.hookEventName !== 'PermissionRequest' ||
    !('decision' in output)
  ) {
    return null;
  }

  const value = output.decision;

  if (typeof value !== 'object' || value === null || !('behavior' in value)) {
    return null;
  }

  if (value.behavior === 'allow') {
    return { decision: 'allow' };
  }

  if (
    value.behavior === 'deny' &&
    'message' in value &&
    typeof value.message === 'string' &&
    value.message.trim() !== ''
  ) {
    return { decision: 'deny', reason: value.message };
  }

  return null;
}
