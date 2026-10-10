import type { ClaudeRules } from '../../src/config/types.ts';

// Each entry becomes a rule the classifier applies, so a test adds the entries
// its scenario needs.
export function buildMockClaudeRules(overrides: Partial<ClaudeRules> = {}): ClaudeRules {
  return { environment: [], allow: [], soft_deny: [], hard_deny: [], ...overrides };
}
