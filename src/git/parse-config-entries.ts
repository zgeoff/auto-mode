import { dirname, join, resolve } from 'node:path';
import { parseConfigValue } from './parse-config-value.ts';

export type ConfigEntry =
  | { readonly kind: 'hooks-path'; readonly value: string }
  | { readonly kind: 'include'; readonly path: string }
  | { readonly kind: 'unknown' };

export interface ConfigSource {
  readonly path: string;
  readonly home: string;
  readonly depth: number;
}

// git stops past this many nested includes.
const MAX_INCLUDE_DEPTH = 10;

// git reads a relative include path from the including file's folder. An
// includeIf holds a condition this parser does not judge, so its value is
// unknown, as is an include past git's depth.
export function parseConfigEntries(config: string, source: ConfigSource): readonly ConfigEntry[] {
  let section = '';
  const entries: ConfigEntry[] = [];

  for (const line of config.split('\n')) {
    const header = /^\s*\[(?<section>[^\]]*)\]/u.exec(line)?.groups?.['section'];
    const entry = /^\s*(?<key>[\w-]+)\s*=(?<value>.*)$/u.exec(line)?.groups;
    const key = entry?.['key']?.toLowerCase();
    const value = parseConfigValue(entry?.['value'] ?? '');

    if (header !== undefined) {
      section = header.trim().toLowerCase();

      if (section.startsWith('includeif')) {
        entries.push({ kind: 'unknown' });
      }
    } else if (section === 'core' && key === 'hookspath') {
      entries.push({ kind: 'hooks-path', value });
    } else if (section === 'include' && key === 'path') {
      const include: ConfigEntry =
        source.depth >= MAX_INCLUDE_DEPTH
          ? { kind: 'unknown' }
          : { kind: 'include', path: resolveIncludePath(value, source) };

      entries.push(include);
    }
  }

  return entries;
}

function resolveIncludePath(path: string, source: ConfigSource): string {
  return path.startsWith('~/')
    ? join(source.home, path.slice(2))
    : resolve(dirname(source.path), path);
}
