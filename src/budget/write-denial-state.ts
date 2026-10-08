import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DenialState } from './types.ts';

export async function writeDenialState(path: string, state: Readonly<DenialState>): Promise<void> {
  const staged = `${path}.${randomUUID()}.tmp`;

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(staged, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await rename(staged, path);
}
