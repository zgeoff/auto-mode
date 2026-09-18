import { match } from 'ts-pattern';
import type { Harness } from '../harness/types.ts';

export function hookConfig(harness: Harness, command: string): string {
  const entry = match(harness)
    .with('claude', () => ({
      // the matcher is a regular expression tested against the tool name. `*`
      // is not a valid one, and `""` matches only the empty tool name; both
      // leave the hook installed and never firing
      matcher: '.*',
      hooks: [{ type: 'command', command, timeout: 90 }],
    }))
    .with('codex', () => ({ hooks: [{ type: 'command', command, timeout: 90 }] }))
    .with('muse', () => ({
      // Muse reads `""` as every tool, the opposite of what it means to Claude
      matcher: '',

      // a handler carrying timeout_ms makes Muse skip the whole handler
      // silently, so this takes type and command and nothing else
      hooks: [{ type: 'command', command }],
    }))
    .exhaustive();

  return JSON.stringify({ hooks: { PreToolUse: [entry] } }, null, 2);
}

export const SETTINGS_PATHS: Readonly<Record<Harness, string>> = {
  claude: '~/.claude/settings.json',
  codex: '~/.codex/hooks.json',
  muse: '~/.config/muse/settings.json',
};

export const SETUP_NOTES: Readonly<Record<Harness, readonly string[]>> = {
  claude: [
    'A tool your permission settings already deny is refused before the hook sees it, so',
    'auto-mode can only narrow what the harness would have allowed.',
  ],
  codex: [
    'Set `hooks = true` in ~/.codex/config.toml.',
    'Codex will not run an untrusted hook. Trust it once when Codex prompts you; the',
    'answer is recorded under [hooks.state] in config.toml. Until then the hook is',
    'skipped silently.',
  ],
  muse: [
    'Muse runs hooks with a scrubbed environment, so an API key from a variable will',
    'not reach it. Set provider.apiKeyCommand in the auto-mode config instead.',
  ],
};
