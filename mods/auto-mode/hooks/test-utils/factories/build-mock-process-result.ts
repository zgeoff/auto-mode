import type { ProcessResult } from '../../types.ts';

// A plugin test loads only the plugin's own files, so faker is out of reach and
// the arbitrary fields take fixed defaults.
export function buildMockProcessResult(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: 'synthetic-private-fragment',
    isStdoutTruncated: false,
    isStderrTruncated: false,
    ...overrides,
  };
}
