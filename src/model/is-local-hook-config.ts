// lefthook merges its local config over the shared one, in YAML, JSON, JSONC or
// TOML, with or without a leading dot.
const LOCAL_CONFIG = /(?:^|\/)\.?lefthook-local\.(?:ya?ml|jsonc?|toml)$/iu;

export function isLocalHookConfig(path: string): boolean {
  return LOCAL_CONFIG.test(path);
}
