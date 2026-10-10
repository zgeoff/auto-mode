import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import type { ClaudeRules, ClaudeSettings, HostEnvironment } from './types.ts';

// The user's settings.json holds both the autoMode rules and the MCP approvals,
// so one read serves both unless a configured path moves the rules elsewhere.
export async function loadClaudeSettings(
  path: string | null | undefined,
  host: Readonly<HostEnvironment>,
): Promise<ClaudeSettings> {
  const configDir = host.env['CLAUDE_CONFIG_DIR'];
  const base = configDir === undefined || configDir === '' ? join(host.home, '.claude') : configDir;
  const userPath = join(base, 'settings.json');

  if (path === undefined) {
    const body = await readSettings(userPath);

    return { rules: parseRules(body), userSettings: body ?? null };
  }

  const userBody = await readSettings(userPath).catch(() => null);

  const rulesBody = path === null ? undefined : await readSettings(path);

  return { rules: parseRules(rulesBody), userSettings: userBody ?? null };
}

async function readSettings(path: string): Promise<unknown> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }

    throw new Error('Claude settings unreadable', { cause: error });
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Claude settings contain invalid JSON');
  }
}

const entries = z.array(z.string()).optional();

const settingsSchema = z.object({
  autoMode: z
    .object({ environment: entries, allow: entries, soft_deny: entries, hard_deny: entries })
    .optional(),
});

function parseRules(body: unknown): ClaudeRules {
  if (body === undefined) {
    return { environment: [], allow: [], soft_deny: [], hard_deny: [] };
  }

  const parsed = settingsSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error('Claude autoMode settings are invalid');
  }

  const rules = parsed.data.autoMode;

  return {
    environment: (rules?.environment ?? []).filter((entry) => entry !== '$defaults'),
    allow: (rules?.allow ?? []).filter((entry) => entry !== '$defaults'),
    soft_deny: (rules?.soft_deny ?? []).filter((entry) => entry !== '$defaults'),
    hard_deny: (rules?.hard_deny ?? []).filter((entry) => entry !== '$defaults'),
  };
}
