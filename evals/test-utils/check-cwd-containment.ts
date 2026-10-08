import type { ContainmentDeny } from '../../src/containment/check-containment.ts';
import { checkContainment } from '../../src/containment/check-containment.ts';
import { buildTaskScope } from '../../src/scope/build-task-scope.ts';
import { pickScopeSourceReader } from '../../src/scope/pick-scope-source-reader.ts';
import type { RecordedCall } from './build-stub-edit-action.ts';

export interface RecordedRepository {
  readonly branch: string | null;
  readonly defaultBranch: string | null;
}

// Checks a recorded call against the cwd scope its checkout gave it. The home
// directory is the first two parts of the cwd, and the one remote has no URL,
// so no pull request belongs to the task.
export async function checkCwdContainment(
  call: Readonly<RecordedCall>,
  repository: Readonly<RecordedRepository>,
): Promise<ContainmentDeny | null> {
  const facts = await pickScopeSourceReader({ kind: 'cwd' })({
    env: {},
    sessionID: '',
    cwd: call.cwd,
    worktree: call.cwd,
    commonDir: null,
    branch: repository.branch,
    stateDir: '',

    // Only the atc source writes a diagnostic, and the replay never reads through it.
    stderr: { write: () => true },
  });

  const scope = buildTaskScope({
    home: call.cwd.split('/').slice(0, 3).join('/'),
    currentBranch: repository.branch,
    defaultBranch: repository.defaultBranch,
    remotes: [{ name: 'origin', url: '' }],
    facts: [facts],
  });

  return checkContainment(
    { sessionID: '', cwd: call.cwd, toolName: call.tool, toolInput: call.input },
    scope,
  );
}
