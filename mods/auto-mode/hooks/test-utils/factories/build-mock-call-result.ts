import type { CallResult } from '../../types.ts';

type CallResultOverrides = { readonly [K in keyof CallResult]?: CallResult[K] | undefined };

// A plugin test loads only the plugin's own files, so faker is out of reach and
// the arbitrary fields take fixed defaults.
export function buildMockCallResult(overrides: CallResultOverrides = {}): CallResult {
  // The host rejects a deny beside a result, so a denied call carries no output.
  const defaults: CallResultOverrides =
    overrides.deny === undefined ? { result: { stdout: '', stderr: '' }, text: '' } : {};

  const merged = { ...defaults, ...overrides };

  return {
    ...(merged.result === undefined ? {} : { result: merged.result }),
    ...(merged.deny === undefined ? {} : { deny: merged.deny }),
    ...(merged.text === undefined ? {} : { text: merged.text }),
    ...(merged.isError === undefined ? {} : { isError: merged.isError }),
  };
}
