import type { Harness } from '../harness/types.ts';

/**
 * Prints the hook entry a harness needs, for the user to paste into their own
 * settings. auto-mode never writes those files itself: they are the user's
 * configuration, and an agent that can edit its own restraints has none.
 */
export function hookConfig(harness: Harness, command: string): string {
  // Muse 1.3 rejects a hook entry carrying `timeout_ms`. It reports an unknown
  // handler field and skips the whole handler, silently, so the hook never
  // runs. A user-tier entry takes `type` and `command` and nothing else.
  const entry =
    harness === 'muse'
      ? { matcher: '', hooks: [{ type: 'command', command }] }
      : { matcher: '*', hooks: [{ type: 'command', command, timeout: 30 }] };

  return JSON.stringify({ hooks: { PreToolUse: [entry] } }, null, 2);
}

export const SETTINGS_PATHS: Readonly<Record<Harness, string>> = {
  claude: '~/.claude/settings.json',
  codex: '~/.codex/hooks.json',
  muse: '~/.config/muse/settings.json',
};
