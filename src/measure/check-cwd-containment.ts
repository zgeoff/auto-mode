import { checkContainment } from 'auto-mode/eval';
import type { ContainmentDeny } from 'auto-mode/eval';
import type { RecordedRepository } from './read-cwd-task-scope.ts';
import { readCwdTaskScope } from './read-cwd-task-scope.ts';

export interface RecordedCall {
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly cwd: string;
}

export async function checkCwdContainment(
  call: Readonly<RecordedCall>,
  repository: Readonly<RecordedRepository>,
): Promise<ContainmentDeny | null> {
  const scope = await readCwdTaskScope(call.cwd, repository);

  return checkContainment(
    { sessionID: '', cwd: call.cwd, toolName: call.tool, toolInput: call.input },
    scope,
  );
}
