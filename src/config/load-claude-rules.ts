import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';

export interface ClaudeRules {
  readonly environment: readonly string[];
  readonly allow: readonly string[];
  readonly soft_deny: readonly string[];
  readonly hard_deny: readonly string[];
}

export async function loadClaudeRules(path?: string | null): Promise<ClaudeRules> {
  const empty: ClaudeRules = { environment: [], allow: [], soft_deny: [], hard_deny: [] };

  if (path === null) {
    return empty;
  }

  const configDir = process.env['CLAUDE_CONFIG_DIR'];
  const base = configDir === undefined || configDir === '' ? join(homedir(), '.claude') : configDir;
  const settingsPath = path ?? join(base, 'settings.json');
  let raw: string;

  try {
    raw = await readFile(settingsPath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return empty;
    }

    throw new Error('Claude settings unreadable', { cause: error });
  }

  const entries = z.array(z.string()).optional();

  const autoMode = z
    .object({ environment: entries, allow: entries, soft_deny: entries, hard_deny: entries })
    .optional();

  const schema = z.object({ autoMode });
  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error('Claude settings contain invalid JSON');
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new Error('Claude autoMode settings are invalid');
  }

  const rules = parsed.data;

  return {
    environment: (rules.autoMode?.environment ?? []).filter((entry) => entry !== '$defaults'),
    allow: (rules.autoMode?.allow ?? []).filter((entry) => entry !== '$defaults'),
    soft_deny: (rules.autoMode?.soft_deny ?? []).filter((entry) => entry !== '$defaults'),
    hard_deny: (rules.autoMode?.hard_deny ?? []).filter((entry) => entry !== '$defaults'),
  };
}
