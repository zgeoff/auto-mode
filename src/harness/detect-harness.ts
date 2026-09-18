import type { Harness } from './types.ts';

/**
 * Names the harness that sent a hook payload.
 *
 * The three shapes overlap, so order matters. Muse carries `model_provider`,
 * which neither of the others sends, so it is tested first — Muse also sends
 * `turn_id`, and testing that first would call every Muse payload Codex. Claude
 * is the only one that sends `prompt_id`. Codex is then what is left that
 * carries `turn_id`.
 *
 * Environment variables cannot help here: Muse runs hook commands with a
 * scrubbed environment, so a Muse hook sees none of them.
 */
export function detectHarness(payload: Readonly<Record<string, unknown>>): Harness | null {
  if ('model_provider' in payload) {
    return 'muse';
  }

  if ('prompt_id' in payload) {
    return 'claude';
  }

  if ('turn_id' in payload) {
    return 'codex';
  }

  return null;
}
