import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ActionRequest } from '../request/types.ts';
import { isLocalHookConfig } from './is-local-hook-config.ts';

// An Edit names only the text it replaces, so a value changed without its key
// needs the file around it to show which setting changed.
export function readLocalHookConfig(
  payload: Pick<ActionRequest, 'cwd' | 'toolName' | 'toolInput'>,
): Promise<string | null> {
  const path = payload.toolInput['file_path'];

  if (payload.toolName !== 'Edit' || typeof path !== 'string' || !isLocalHookConfig(path)) {
    return Promise.resolve(null);
  }

  return readFile(resolve(payload.cwd, path), 'utf8').catch(() => null);
}
