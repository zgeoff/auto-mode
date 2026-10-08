import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScopeRemote } from '../containment/collect-scope-findings.ts';

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
      const url = /^\s*(?:push)?url\s*=\s*(?<url>\S+)/u.exec(line)?.groups?.['url'];

      if (url !== undefined) {
        remotes.push({ name: section, url });
      }
    }
  }

  return remotes;
}
