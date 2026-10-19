import { resolve } from 'node:path';
import { tryClassifyEdit } from 'auto-mode/eval';
import type { EditClassification } from 'auto-mode/eval';
import { buildStubEditFileReader } from '../../test-utils/build-stub-edit-file-reader.ts';
import { buildMockHostEnvironment } from '../../test-utils/factories/build-mock-host-environment.ts';
import type { RecordedCall } from './check-cwd-containment.ts';
import type { RecordedRepository } from './read-cwd-task-scope.ts';
import { readCwdTaskScope } from './read-cwd-task-scope.ts';

// A recording holds no links and no file content: every path is its own real
// path, git places every target in the cwd checkout, even one outside the
// scope's worktrees, and an Edit's file holds the text it replaces.
export async function classifyRecordedEdit(
  call: Readonly<RecordedCall>,
  repository: Readonly<RecordedRepository>,
): Promise<EditClassification | null> {
  const scope = await readCwdTaskScope(call.cwd, repository);

  const path = call.input['file_path'];
  const old = call.input['old_string'];

  const files =
    typeof path === 'string' && typeof old === 'string' ? { [resolve(call.cwd, path)]: old } : {};

  return tryClassifyEdit(
    { sessionID: '', cwd: call.cwd, toolName: call.tool, toolInput: call.input },
    scope,
    buildMockHostEnvironment({ env: {}, home: scope.home }),
    buildStubEditFileReader({ checkout: call.cwd, files }),
  );
}
