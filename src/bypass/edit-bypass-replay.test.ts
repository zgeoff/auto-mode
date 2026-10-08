import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as z from 'zod';
import { classifyEdit } from './classify-edit.ts';
import { getEditFields } from './get-edit-fields.ts';

const root = resolve(import.meta.dirname, '../..');
const inputSchema = z.record(z.string(), z.unknown());

const caseSchema = z.object({
  id: z.string(),
  tool: z.string(),
  input: inputSchema,
  cwd: z.string(),
});

const corpusSchema = z.object({ cases: z.array(caseSchema) });

// GEO-104's 232 approved real actions, each against the cwd scope its session
// had; a target that qualifies skips Jev unless the secret scan matches.
test('it lets 83 of the 232 real actions skip Jev and sends 3 secret-shaped edits to it', async () => {
  const text = await readFile(resolve(root, 'fixtures/decision-rules/real-traffic.json'), 'utf8');

  const corpus = corpusSchema.parse(JSON.parse(text));

  const tally = new Map<string, number>();

  for (const entry of corpus.cases) {
    const fields = getEditFields(entry.tool);
    const path = fields === null ? null : entry.input[fields.path];

    const outcome =
      typeof path === 'string'
        ? classifyEdit(
            { toolName: entry.tool, toolInput: entry.input, target: resolve(entry.cwd, path) },
            { worktrees: [entry.cwd], protectedDirs: [] },
          )
        : null;

    const reason = outcome?.kind === 'jev' ? outcome.reason : 'bypass';
    const key = outcome === null ? 'not a file-tool edit' : reason;

    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  expect(Object.fromEntries(tally)).toStrictEqual({
    'not a file-tool edit': 136,
    bypass: 83,
    'secret scan matched generic-credential-uri': 2,
    'secret scan matched generic-password': 1,
    'target in a nested worktree outside the scope': 2,
    'target outside every in-scope worktree': 8,
  });
});
