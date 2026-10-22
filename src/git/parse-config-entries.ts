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
  const lines = config.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const header = /^\s*\[(?<section>[^\]]*)\](?<rest>.*)$/su.exec(line)?.groups;

    if (header !== undefined) {
      section = (header['section'] ?? '').trim().toLowerCase();

      if (section.startsWith('includeif')) {
        entries.push({ kind: 'unknown' });
      }
    }

    // git reads an assignment on the same line as its section header.
    const assignment = header === undefined ? line : (header['rest'] ?? '');
    const entry = /^\s*(?<key>[\w-]+)\s*=(?<value>.*)$/su.exec(assignment)?.groups;
    const key = entry?.['key']?.toLowerCase();
    let raw = entry?.['value'] ?? '';

    // A value that ends in an unescaped backslash goes on at the next line.
    while (hasContinuation(raw) && index + 1 < lines.length) {
      index += 1;
      raw = `${raw.slice(0, -1)}${lines[index] ?? ''}`;
    }

    const value = parseConfigValue(raw);

    if (section === 'core' && key === 'hookspath') {
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

// git ends a comment at the line's end, so a backslash in one goes on nowhere.
function hasContinuation(raw: string): boolean {
  let isQuoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw.charAt(index);

    if (char === '\\') {
      if (index === raw.length - 1) {
        return true;
      }

      index += 1;
    } else if (char === '"') {
      isQuoted = !isQuoted;
    } else if (!isQuoted && (char === '#' || char === ';')) {
      return false;
    }
  }

  return false;
}

function resolveIncludePath(path: string, source: ConfigSource): string {
  return path.startsWith('~/')
    ? join(source.home, path.slice(2))
    : resolve(dirname(source.path), path);
}
