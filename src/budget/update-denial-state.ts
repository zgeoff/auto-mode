import type { LockClock } from '../state/types.ts';
import { updateJSONFile } from '../state/update-json-file.ts';
import { loadDenialState } from './load-denial-state.ts';
import type { DenialState } from './types.ts';

export function updateDenialState(
  path: string,
  update: (current: Readonly<DenialState>) => DenialState,
  clock?: Readonly<LockClock>,
): Promise<{ readonly previous: DenialState; readonly next: DenialState }> {
  return updateJSONFile(path, loadDenialState, update, clock);
}
