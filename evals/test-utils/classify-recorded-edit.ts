import type { EditClassification } from '../../src/bypass/classify-edit.ts';
import { tryClassifyEdit } from '../../src/bypass/try-classify-edit.ts';
import { buildTaskScope } from '../../src/scope/build-task-scope.ts';
import { pickScopeSourceReader } from '../../src/scope/pick-scope-source-reader.ts';
import type { RecordedCall } from './build-stub-edit-file-reader.ts';
import { buildStubEditFileReader } from './build-stub-edit-file-reader.ts';
import type { RecordedRepository } from './check-cwd-containment.ts';

// Classifies a recorded edit against the cwd scope its checkout gave it, with
// the call's recording in place of the filesystem. The home directory is the
// first two parts of the cwd.
export async function classifyRecordedEdit(
  call: Readonly<RecordedCall>,
  repository: Readonly<RecordedRepository>,
): Promise<EditClassification | null> {
  const home = call.cwd.split('/').slice(0, 3).join('/');

  const facts = await pickScopeSourceReader({ kind: 'cwd' })({
    env: {},
    sessionID: '',
    cwd: call.cwd,
    worktree: call.cwd,
    commonDir: null,
    branch: repository.branch,
    stateDir: '',

    // Only the atc source writes a diagnostic, and this reads the cwd source alone.
    stderr: { write: () => true },
  });

  const scope = buildTaskScope({
    home,
    currentBranch: repository.branch,
    defaultBranch: repository.defaultBranch,
    remotes: [{ name: 'origin', url: '' }],
    facts: [facts],
  });

  return tryClassifyEdit(
    { sessionID: '', cwd: call.cwd, toolName: call.tool, toolInput: call.input },
    scope,
    { env: {}, home },
    buildStubEditFileReader(call),
  );
}
