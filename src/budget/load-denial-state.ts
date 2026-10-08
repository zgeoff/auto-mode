import { readFile } from 'node:fs/promises';
import * as z from 'zod';
import type { DenialState } from './types.ts';
import { EMPTY_DENIAL_STATE } from './types.ts';

const count = z.number().int().nonnegative();

const stateSchema = z.strictObject({
  consecutive: count,
  session: count,
  lastDenied: z
    .strictObject({ actionHash: z.string().min(1), rule: z.string(), reason: z.string() })
    .nullable(),
});

// A missing or unreadable file starts the session from zero; the budget then
// errs toward more denials before a prompt, never toward an allow.
export async function loadDenialState(path: string): Promise<DenialState> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return EMPTY_DENIAL_STATE;
  }

  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw));

    return parsed.success ? parsed.data : EMPTY_DENIAL_STATE;
  } catch {
    return EMPTY_DENIAL_STATE;
  }
}
