import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeReport } from './write-report.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'write-report-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it writes a report as two-space JSON ending in a newline', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dir, 'report.json');

  await writeReport(path, { model: 'jev', records: [1] });

  const text = await readFile(path, 'utf8');

  expect(text).toBe('{\n  "model": "jev",\n  "records": [\n    1\n  ]\n}\n');
});
