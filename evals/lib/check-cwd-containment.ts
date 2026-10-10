import { checkContainment } from 'auto-mode';
import type { ContainmentDeny } from 'auto-mode';
import type { RecordedRepository } from './build-cwd-task-scope.ts';
import { buildCwdTaskScope } from './build-cwd-task-scope.ts';

export interface RecordedCall {
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly cwd: string;
}

// Checks a recorded call against the scope its cwd checkout gave it.
export async function checkCwdContainment(
  call: Readonly<RecordedCall>,
  repository: Readonly<RecordedRepository>,
): Promise<ContainmentDeny | null> {
  const scope = await buildCwdTaskScope(call.cwd, repository);

  return checkContainment(
    { sessionID: '', cwd: call.cwd, toolName: call.tool, toolInput: call.input },
    scope,
  );
}
