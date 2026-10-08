import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import * as z from 'zod';

const name = z.string().min(1);
const path = name.refine(isAbsolute, 'an absolute path');
const checkoutSchema = z.object({ path, branch: name.nullable() }).readonly();
const branchSchema = z.object({ name, repo: path.optional() }).readonly();
const pullNumber = z.number().int().positive();

const pullRequestSchema = z
  .object({ repo: name, number: pullNumber, url: name.optional(), branch: name.nullable() })
  .readonly();

const scopeSchema = z
  .object({
    workspace: checkoutSchema,
    worktrees: z.array(checkoutSchema).readonly(),
    branches: z.array(branchSchema).readonly(),
    pullRequests: z.array(pullRequestSchema).readonly(),
  })
  .readonly();

const recordSchema = z
  .object({
    format: z.literal('atc.session-record'),
    version: z.literal(1),
    session: name,
    scope: scopeSchema,
  })
  .readonly();

export type AtcSessionRecord = z.infer<typeof recordSchema>;

export type AtcRecordLoad =
  | { readonly kind: 'absent' }
  | { readonly kind: 'record'; readonly record: AtcSessionRecord }
  | { readonly kind: 'malformed'; readonly diagnostic: string };

// atc removes the file when it forgets a session, so a missing file is a
// session without a record; anything else that fails is worth one line.
export async function loadAtcSessionRecord(
  location: string | undefined,
  sessionID: string | undefined,
): Promise<AtcRecordLoad> {
  if (location === undefined || location === '') {
    return { kind: 'absent' };
  }

  if (!isAbsolute(location)) {
    return {
      kind: 'malformed',
      diagnostic: `atc session record path is not absolute: ${location}`,
    };
  }

  let raw: string;

  try {
    raw = await readFile(location, 'utf8');
  } catch (error) {
    return isMissing(error)
      ? { kind: 'absent' }
      : { kind: 'malformed', diagnostic: `atc session record unreadable: ${location}` };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'malformed', diagnostic: `atc session record is not JSON: ${location}` };
  }

  const result = recordSchema.safeParse(parsed);

  if (!result.success) {
    const [issue] = result.error.issues;
    const field = issue === undefined ? 'record' : issue.path.join('.') || 'record';

    return {
      kind: 'malformed',
      diagnostic: `atc session record ignored: ${field} does not match version 1: ${location}`,
    };
  }

  if (sessionID === undefined || sessionID === '') {
    return {
      kind: 'malformed',
      diagnostic: `atc session record has no session to match: ${location}`,
    };
  }

  if (result.data.session !== sessionID) {
    return {
      kind: 'malformed',
      diagnostic: `atc session record belongs to another session: ${location}`,
    };
  }

  return { kind: 'record', record: result.data };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
