import type { PermissionDecision } from '../../types.ts';

// A plugin test loads only the plugin's own files, so faker is out of reach and
// the arbitrary fields take fixed defaults.
export function buildMockPermissionDecision(
  overrides: Partial<PermissionDecision> = {},
): PermissionDecision {
  return {
    decision: 'ask',
    reason: 'Existing permission decision',
    rule: 'Bash(git push:*)',
    hook: 'PreToolUse',
    ...overrides,
  };
}
