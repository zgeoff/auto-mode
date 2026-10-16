import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';

const fixtureSchema = z.record(z.string(), z.unknown());

// A file a live Claude Code session wrote, such as a mod request. These are recordings,
// not a substitute for running the mod by hand.
export function readFixture(name: string): Record<string, unknown> {
  const path = join(import.meta.dirname, '..', 'fixtures', `${name}.json`);

  return fixtureSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}
