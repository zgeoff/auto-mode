import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';

const fixtureSchema = z.record(z.string(), z.unknown());

// A recorded PreToolUse payload from a live session of the named harness. These
// are recordings, not a substitute for running the harness by hand.
export function readFixture(harness: string): Record<string, unknown> {
  const path = join(import.meta.dirname, '..', 'fixtures', `${harness}-pre-tool-use.json`);

  return fixtureSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}
