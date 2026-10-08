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
      const value = /^\s*(?:push)?url\s*=(?<value>.*)$/iu.exec(line)?.groups?.['value'];
      const url = value === undefined ? '' : parseConfigValue(value);

      if (url !== '') {
        remotes.push({ name: section, url });
      }
    }
  }

  return remotes;
}

// Git reads a config value with its quotes removed, its escapes resolved, and
// an unquoted `#` or `;` starting a comment.
function parseConfigValue(raw: string): string {
  let value = '';
  let isQuoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index] ?? '';

    if (char === '\\') {
      const next = raw[index + 1] ?? '';

      value += ({ n: '\n', t: '\t', b: '' } as Record<string, string>)[next] ?? next;
      index += 1;
    } else if (char === '"') {
      isQuoted = !isQuoted;
    } else if (!isQuoted && (char === '#' || char === ';')) {
      break;
    } else {
      value += char;
    }
  }

  return value.trim();
}
