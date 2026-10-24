import * as z from 'zod';
import { loadJSONFile } from '../state/load-json-file.ts';
import type { DenialState } from './types.ts';
import { EMPTY_DENIAL_STATE } from './types.ts';

const count = z.number().int().nonnegative();

const stateSchema = z.strictObject({
  consecutive: count,
  session: count,
  lastDenied: z
    .strictObject({ retryKey: z.string().min(1), rule: z.string(), reason: z.string() })
    .nullable(),
});

export function loadDenialState(path: string): Promise<DenialState> {
  return loadJSONFile(path, stateSchema, EMPTY_DENIAL_STATE);
}
