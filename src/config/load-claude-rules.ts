import { loadClaudeSettings } from './load-claude-settings.ts';
import type { ClaudeRules, HostEnvironment } from './types.ts';

export async function loadClaudeRules(
  path: string | null | undefined,
  host: Readonly<HostEnvironment>,
): Promise<ClaudeRules> {
  const settings = await loadClaudeSettings(path, host);

  return settings.rules;
}
