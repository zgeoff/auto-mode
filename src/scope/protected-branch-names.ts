// The conventional default branch names, which stand in for the default branch
// when it is unknown and which no scope source or user message can grant.
export const PROTECTED_BRANCH_NAMES: ReadonlySet<string> = new Set([
  'main',
  'master',
  'trunk',
  'develop',
]);
