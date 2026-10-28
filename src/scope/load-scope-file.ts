import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import * as z from 'zod';

const name = z.string().min(1);
const path = name.refine(isAbsolute, 'an absolute path').transform((value) => resolve(value));
const checkoutSchema = z.strictObject({ path, branch: name.nullable() }).readonly();
const branchSchema = z.strictObject({ name, repo: path.optional() }).readonly();

const pullRequestSchema = z
  .strictObject({
    repo: name,
    number: z.number().int().positive(),
    url: name.optional(),
    branch: name,
  })
  .readonly();

const replyChannelSchema = z.strictObject({ tool: name, field: name, recipient: name }).readonly();

const scopeFileSchema = z
  .strictObject({
    format: z.literal('auto-mode.scope'),
    version: z.literal(1),
    paths: z.array(path).readonly().default([]),
    workspace: checkoutSchema.optional(),
    worktrees: z.array(checkoutSchema).readonly().default([]),
    branches: z.array(branchSchema).readonly().default([]),
    pullRequests: z.array(pullRequestSchema).readonly().default([]),
    replyChannels: z.array(replyChannelSchema).readonly().default([]),
  })
  .superRefine((file, context) => {
    if (file.workspace !== undefined) {
      return;
    }

    for (const [index, branch] of file.branches.entries()) {
      if (branch.repo === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['branches', index, 'repo'],
          message: 'a branch needs a repo when the file declares no workspace',
        });
      }
    }
  })
  .readonly();

type ScopeFile = z.infer<typeof scopeFileSchema>;

export type ScopeFileLoad =
  | { readonly kind: 'absent' }
  | { readonly kind: 'scope'; readonly scope: ScopeFile }
  | { readonly kind: 'malformed'; readonly diagnostic: string };

export async function loadScopeFile(location: string | undefined): Promise<ScopeFileLoad> {
  if (location === undefined || location === '') {
    return { kind: 'absent' };
  }

  if (!isAbsolute(location)) {
    return { kind: 'malformed', diagnostic: `scope file path is not absolute: ${location}` };
  }

  let raw: string;

  try {
    raw = await readFile(location, 'utf8');
  } catch (error) {
    return isMissing(error)
      ? { kind: 'absent' }
      : { kind: 'malformed', diagnostic: `scope file unreadable: ${location}` };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'malformed', diagnostic: `scope file is not JSON: ${location}` };
  }

  const result = scopeFileSchema.safeParse(parsed);

  if (!result.success) {
    const [issue] = result.error.issues;
    const field = issue === undefined ? 'file' : issue.path.join('.') || 'file';

    return {
      kind: 'malformed',
      diagnostic: `scope file ignored: ${field} does not match version 1: ${location}`,
    };
  }

  return { kind: 'scope', scope: result.data };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
