import { dirname, join, resolve } from 'node:path';
import { parseGitConfig } from './parse-git-config.ts';

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
const UNKNOWN_ENTRY: ConfigEntry = { kind: 'unknown' };

// git reads a relative include path from the including file's folder. An
// includeIf's condition goes unjudged, so it is unknown, as are an include past
// git's depth, a key with no value, and a file git refuses.
export function parseConfigEntries(config: string, source: ConfigSource): readonly ConfigEntry[] {
  const variables = parseGitConfig(config);

  if (variables === null) {
    return [UNKNOWN_ENTRY];
  }

  return variables.flatMap((variable): readonly ConfigEntry[] => {
    const isIncludeIf = variable.name.startsWith('includeif.') && variable.name.endsWith('.path');

    if (variable.name !== 'core.hookspath' && variable.name !== 'include.path' && !isIncludeIf) {
      return [];
    }

    if (variable.value === null || isIncludeIf) {
      return [UNKNOWN_ENTRY];
    }

    if (variable.name === 'core.hookspath') {
      return [{ kind: 'hooks-path', value: variable.value }];
    }

    return source.depth >= MAX_INCLUDE_DEPTH
      ? [UNKNOWN_ENTRY]
      : [{ kind: 'include', path: resolveIncludePath(variable.value, source) }];
  });
}

function resolveIncludePath(path: string, source: ConfigSource): string {
  return path.startsWith('~/')
    ? join(source.home, path.slice(2))
    : resolve(dirname(source.path), path);
}
