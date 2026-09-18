import type { Harness } from '../harness/types.ts';

/**
 * Prints the hook entry a harness needs, for the user to paste into their own
 * settings. auto-mode never writes those files itself: they are the user's
 * configuration, and an agent that can edit its own restraints has none.
 *
 * All three take a different entry shape, and each difference is load-bearing:
 *
 * - Claude matches tool names against a regular expression, so matching every
 *   tool is `.*`. Two near-misses both leave the hook installed but never
 *   firing: `*` is not a valid regular expression, and `""` matches only a tool
 *   whose name is the empty string.
 * - Muse takes `""` to mean every tool, so the same value means opposite things
 *   in the two harnesses.
 * - Codex registers a bare handler list with no matcher.
 * - Muse 1.3 rejects a handler carrying `timeout_ms`, reporting an unknown
 *   field and skipping the whole handler silently, so the hook never runs. A
 *   user-tier Muse entry takes `type` and `command` and nothing else.
 *
 * The timeout is 90 seconds, not the usual 30: a reasoning model takes 13-24
 * seconds on a hard case, and a harness timeout shorter than the model call
 * turns every hard case into a silent failure.
 */
export function hookConfig(harness: Harness, command: string): string {
  const entry =
    harness === 'claude'
      ? { matcher: '.*', hooks: [{ type: 'command', command, timeout: 90 }] }
      : harness === 'codex'
        ? { hooks: [{ type: 'command', command, timeout: 90 }] }
        : { matcher: '', hooks: [{ type: 'command', command }] };

  return JSON.stringify({ hooks: { PreToolUse: [entry] } }, null, 2);
}

export const SETTINGS_PATHS: Readonly<Record<Harness, string>> = {
  claude: '~/.claude/settings.json',
  codex: '~/.codex/hooks.json',
  muse: '~/.config/muse/settings.json',
};

/** What else each harness needs before the hook will run. Empty when nothing. */
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
