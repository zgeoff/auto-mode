import type { ClaudeRules } from '../../config/types.ts';

export function buildMockClaudeRules(overrides: Partial<ClaudeRules> = {}): ClaudeRules {
  return { environment: [], allow: [], soft_deny: [], hard_deny: [], ...overrides };
}
