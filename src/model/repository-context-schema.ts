import * as z from 'zod';

export const repositoryContextSchema = z.object({
  cwd: z.string(),
  branch: z.string().nullable(),
  defaultBranch: z.string().nullable(),
});
