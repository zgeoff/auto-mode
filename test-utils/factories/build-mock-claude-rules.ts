import type { ClaudeRules } from '../../src/config/types.ts';

export function buildMockClaudeRules(overrides: Partial<ClaudeRules> = {}): ClaudeRules {
  return { environment: [], allow: [], soft_deny: [], hard_deny: [], ...overrides };
}
