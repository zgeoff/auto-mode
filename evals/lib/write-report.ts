import { writeFile } from 'node:fs/promises';

export async function writeReport(path: string, report: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
}
