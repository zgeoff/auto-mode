import { matchesGlob } from 'node:path';

// A pattern reads as a forge's branch protection rule does: `*` stops at a
// slash, so `release/*` protects `release/2.0` and not `release/2.0/hotfix`.
export function isProtectedBranch(branch: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesGlob(branch, pattern));
}
