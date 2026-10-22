import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScopeRemote } from '../scope/types.ts';
import { parseGitConfig } from './parse-git-config.ts';

export async function loadCheckoutRemotes(commonDir: string): Promise<ScopeRemote[]> {
  const config = await readFile(join(commonDir, 'config'), 'utf8').catch(() => '');

  return (parseGitConfig(config) ?? []).flatMap((variable) => {
    const name = /^remote\.(?<name>.+)\.(?:push)?url$/su.exec(variable.name)?.groups?.['name'];

    return name === undefined || variable.value === null || variable.value === ''
      ? []
      : [{ name, url: variable.value }];
  });
}
