import type { Harness } from './types.ts';

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
