import { resolve } from 'node:path';
import type { EditClassification } from '../../src/bypass/classify-edit.ts';
import { tryClassifyEdit } from '../../src/bypass/try-classify-edit.ts';
import { buildStubEditFileReader } from '../../test-utils/build-stub-edit-file-reader.ts';
import type { RecordedRepository } from './build-cwd-task-scope.ts';
import { buildCwdTaskScope } from './build-cwd-task-scope.ts';
import type { RecordedCall } from './check-cwd-containment.ts';

// A recording holds no links and no file content: every path is its own real
// path, git places every target in the cwd checkout, even one outside the
// scope's worktrees, and an Edit's file holds the text it replaces.
export async function classifyRecordedEdit(
  call: Readonly<RecordedCall>,
  repository: Readonly<RecordedRepository>,
): Promise<EditClassification | null> {
  const scope = await buildCwdTaskScope(call.cwd, repository);

  const path = call.input['file_path'];
  const old = call.input['old_string'];

  const files =
    typeof path === 'string' && typeof old === 'string' ? { [resolve(call.cwd, path)]: old } : {};

  return tryClassifyEdit(
    { sessionID: '', cwd: call.cwd, toolName: call.tool, toolInput: call.input },
    scope,
    { env: {}, home: scope.home },
    buildStubEditFileReader({ checkout: call.cwd, files }),
  );
}
