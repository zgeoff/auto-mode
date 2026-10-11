import { join } from 'node:path';
import { resolveXDGDir } from 'auto-mode/eval';

// The same resolution the CLI applies when it writes the log.
export function resolveActionLogPath(
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string {
  const configured = env['AUTO_MODE_DIAGNOSTICS_PATH'];

  if (configured === '') {
    throw new Error(
      'AUTO_MODE_DIAGNOSTICS_PATH is empty, so no action log is written; pass --log.',
    );
  }

  return configured ?? join(resolveXDGDir({ env, home }, 'state'), 'actions.jsonl');
}
