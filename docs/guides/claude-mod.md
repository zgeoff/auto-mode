# Claude permission mod

The optional mod judges Claude Code permission requests before the dialog appears. It uses
`tool.check` in Claude Code 2.1.289 and the Jev evaluator from the same auto-mode checkout.
Traditional evaluator presets remain available to the hook CLI.

The mod calls `next(e)` first and keeps an existing allow or deny unchanged, including its reason
and rule. It evaluates only ask decisions. An uncertain verdict, missing executable, child timeout,
invalid output, or absent session context preserves the original ask. A configured classifier
failure under `onFailure: "deny"` can still return a named denial.

Jev receives the existing policy and settings, the complete action, and the last direct user message
from the session transcript. Session start and user prompt events supply the transcript path. The
mod skips known subagent calls rather than applying the main session's user authorization to them. A
hot reload without context preserves manual approval until the next user prompt.

## Time limits

The mod passes `--jev-only`, which refuses Messages API providers and caps Jev's API timeout at 5
seconds. The child process has an 8-second limit, reduced to leave 250 ms within the handler's
remaining budget. The mod declines evaluation when fewer than 500 ms remain. It discards child
stderr and does not copy invalid output into diagnostics.

## Check the mod

Run the local gates with Claude Code 2.1.289 installed:

```bash
bun run check
bun run check:claude-mod
```

The mod gate runs plugin validation and native event tests with a clean environment and isolated
Claude configuration. It starts no session and makes no network call. The TypeScript declarations
cover the fields that this mod uses from that Claude Code version.

## Try one session

1. Build auto-mode from the same checkout.

   ```bash
   bun run build
   ```

2. Select the Jev preset and the existing private key helper in the auto-mode configuration.
3. Start a separate test session with the mod.

   ```bash
   mod_bin_dir=$(mktemp -d)
   ln -s "$PWD/dist/cli.js" "$mod_bin_dir/auto-mode"
   PATH="$mod_bin_dir:$PATH" claude --plugin-dir ./mods/auto-mode
   rm "$mod_bin_dir/auto-mode"
   rmdir "$mod_bin_dir"
   ```

Use an auto-mode executable that includes `--jev-only`; an older artifact preserves manual approval.
The `auto-mode.command` plugin setting accepts an executable name or absolute path as one argument,
without a shell. Point it at the reviewed artifact before the session test.

Test known allow, deny, ask, and failure cases before wider use. Keep the existing Claude permission
settings. Use a session without the legacy auto-mode `PermissionRequest` hook, which otherwise
evaluates an unresolved ask again. To stop the mod, exit the test session and start the next session
without `--plugin-dir`.

[Claude event semantics](https://code.claude.com/docs/en/plugins/mods/events#approve-or-refuse-a-tool-call-before-the-user-is-asked)
describe the permission chain and the decisions that mods can change.
