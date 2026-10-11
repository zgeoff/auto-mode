// The commands that can create a worktree, a branch, or a PR, keyed by program.
// Each entry is the words that follow the program and its leading options.
export const SCOPE_COMMANDS = {
  git: ['worktree add', 'checkout', 'switch', 'branch'],
  gh: ['pr create'],
} as const;
