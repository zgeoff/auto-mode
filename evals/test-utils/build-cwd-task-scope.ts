import type { OwnedScope } from '../../src/containment/collect-scope-findings.ts';
import { buildTaskScope } from '../../src/scope/build-task-scope.ts';
import { pickScopeSourceReader } from '../../src/scope/pick-scope-source-reader.ts';

export interface RecordedRepository {
  readonly branch: string | null;
  readonly defaultBranch: string | null;
}

// A recording holds neither the home directory nor the remotes: the home is
// the first two parts of the cwd, and the one remote has no URL, so no pull
// request belongs to the task.
export async function buildCwdTaskScope(
  cwd: string,
  repository: Readonly<RecordedRepository>,
): Promise<OwnedScope> {
  const facts = await pickScopeSourceReader({ kind: 'cwd' })({
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
