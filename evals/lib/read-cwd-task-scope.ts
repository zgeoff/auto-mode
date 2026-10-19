import { buildTaskScope, makeScopeSourceReader } from 'auto-mode/eval';
import type { OwnedScope } from 'auto-mode/eval';

export interface RecordedRepository {
  readonly branch: string | null;
  readonly defaultBranch: string | null;
}

// A recording holds neither the home directory nor the remotes: the home is
// the first two parts of the cwd, and the one remote has no URL, so no pull
// request belongs to the task.
export async function readCwdTaskScope(
  cwd: string,
  repository: Readonly<RecordedRepository>,
): Promise<OwnedScope> {
  const facts = await makeScopeSourceReader({ kind: 'cwd' })({
    env: {},
    sessionID: '',
    cwd,
    worktree: cwd,
    commonDir: null,
    branch: repository.branch,
    stateDir: '',

    // Only the atc source writes a diagnostic, and this reads the cwd source alone.
    stderr: { write: () => true },
  });

  return buildTaskScope({
    home: cwd.split('/').slice(0, 3).join('/'),
    currentBranch: repository.branch,
    defaultBranch: repository.defaultBranch,
    remotes: [{ name: 'origin', url: '' }],
    facts: [facts],
  });
}
