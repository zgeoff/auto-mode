import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScopeRemote } from '../scope/types.ts';
import { parseConfigValue } from './parse-config-value.ts';

export async function loadCheckoutRemotes(commonDir: string): Promise<ScopeRemote[]> {
  const config = await readFile(join(commonDir, 'config'), 'utf8').catch(() => '');

  const remotes: ScopeRemote[] = [];
  let section: string | null = null;

  for (const line of config.split('\n')) {
    const header = /^\s*\[remote "(?<name>[^"]+)"\]/u.exec(line)?.groups?.['name'];

    if (header !== undefined) {
      section = header;
    } else if (/^\s*\[/u.test(line)) {
      section = null;
    } else if (section !== null) {
      const value = /^\s*(?:push)?url\s*=(?<value>.*)$/iu.exec(line)?.groups?.['value'];
      const url = value === undefined ? '' : parseConfigValue(value);

      if (url !== '') {
        remotes.push({ name: section, url });
      }
    }
  }

  return remotes;
}
