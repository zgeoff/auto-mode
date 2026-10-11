import type { LockClock } from '../state/types.ts';
import { updateJSONFile } from '../state/update-json-file.ts';
import { loadSessionScope } from './load-session-scope.ts';
import { mergeSessionScope } from './merge-session-scope.ts';
import type { SessionScope } from './types.ts';

// Subagents of one session record in parallel CLI processes, so the merge runs
// under the state file lock.
export async function writeSessionScope(
  path: string,
  added: Readonly<SessionScope>,
  clock?: Readonly<LockClock>,
): Promise<void> {
  await updateJSONFile(
    path,
    loadSessionScope,
    (current) => mergeSessionScope([current, added]),
    clock,
  );
}
