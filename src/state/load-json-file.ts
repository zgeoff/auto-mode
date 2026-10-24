import { readFile } from 'node:fs/promises';
import type * as z from 'zod';

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
