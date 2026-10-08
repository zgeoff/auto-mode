import type { CallResult } from '../../types.ts';

// A plugin test loads only the plugin's own files, so faker is out of reach and
// the arbitrary fields take fixed defaults.
export function buildMockCallResult(overrides: Partial<CallResult> = {}): CallResult {
  return {
    result: { stdout: '', stderr: '' },
    text: '',
    ...overrides,
  };
}
