import * as z from 'zod';
import type { RepositoryContext } from './types.ts';

export const repositoryContextSchema = z.object({
  cwd: z.string(),
  branch: z.string().nullable(),
  defaultBranch: z.string().nullable(),
}) satisfies z.ZodType<RepositoryContext>;
