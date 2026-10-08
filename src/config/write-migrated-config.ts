import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';
import { normalizeConfigFile } from './normalize-config-file.ts';

export async function writeMigratedConfig(path: string): Promise<string> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return `${path} does not exist; nothing to migrate`;
    }

    throw new Error(`${path} is unreadable`, { cause: error });
  }

  let json: unknown;

  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }

  const normalized = normalizeConfigFile(json, path);

  if (!normalized.isLegacy) {
    return `${path} already uses the current shape`;
  }

  const backup = `${path}.bak`;
  const staged = `${path}.migrating`;

  await copyFile(path, backup);
  await writeFile(staged, `${JSON.stringify(normalized.file, null, 2)}\n`, { mode: 0o600 });
  await rename(staged, path);

  return `rewrote ${path} in the current shape; the old file is at ${backup}`;
}
