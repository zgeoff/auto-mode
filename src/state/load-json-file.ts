import { readFile } from 'node:fs/promises';
import type * as z from 'zod';

// A missing, unreadable or malformed file reads as the fallback, so a caller
// picks the value its own check errs toward.
export async function loadJSONFile<S extends z.ZodType, F>(
  path: string,
  schema: S,
  fallback: F,
): Promise<z.infer<S> | F> {
  try {
    const text = await readFile(path, 'utf8');

    const parsed = schema.safeParse(JSON.parse(text));

    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}
