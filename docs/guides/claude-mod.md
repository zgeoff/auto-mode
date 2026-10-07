# Claude permission mod

The mod is how auto-mode runs in Claude Code. It judges a permission request before the dialog
appears. It uses `tool.check` in Claude Code 2.1.292 and runs the auto-mode CLI from the same
release as a child process. The generative presets remain available to library callers.

The mod calls `next(e)` first and keeps an existing allow or deny unchanged, including its reason
and rule. It evaluates only ask decisions. An uncertain verdict, missing executable, child timeout,
invalid output, or absent session context preserves the original ask. A configured classifier
failure under `onFailure: "deny"` can still return a named denial.

The mod evaluates main and subagent calls through the same permission check. Each check reads the
current directory inside that call's host context. Agent delegation passes through the normal check
before a child starts. Existing denials remain final.

The mod captures the first direct task and the current direct message from the host's prompt event.
It keeps their composer, Remote Control, or SDK origins. It captures each child's original task from
its spawn event. Jev receives these as separate task context beside the complete policy and action:

| Field                   | Evidence                                                    |
| ----------------------- | ----------------------------------------------------------- |
| `originalUserTask`      | The first direct task captured in this process              |
| `delegatedTask`         | The child's original agent-authored task                    |
| `lastDirectUserMessage` | The current direct message, absent for a child              |
| `omittedTaskContext`    | Tasks absent through unavailable context or the byte budget |

Task prompts describe purpose and never grant consent or clear a blocked rule. auto-mode reads no
transcript; the mod's request is its only source of user evidence. A notification does not replace
the last direct user message. Resume within the same process keeps a captured original task. Session
resume or mod reload cannot recover its origin, so the original task remains explicitly unavailable,
and the request carries no direct user message until the next prompt. A reload without session
context preserves manual approval until the next user prompt.

## The request and the verdict

Each request carries the session identity, the tool-call identifier, the current directory, the
complete action, and the task context above. The mod reads `session_id` from `classic.SessionStart`
and `classic.UserPromptSubmit`. Claude Code's `--resume` keeps the session ID unless
`--fork-session` is passed. The mod keeps no other state across a reload.

```json
{
  "sessionID": "ad77ccd8-9f10-4b62-b299-1a9f2f444c54",
  "toolUseID": "toolu_01TitHxkfDEFxwCMrnRojXq8",
  "cwd": "/repo",
  "toolName": "Bash",
  "toolInput": { "command": "rm -rf dist" },
  "context": {
    "agentID": null,
    "originalUserTask": { "text": "Clean the build output", "origin": "composer" },
    "delegatedTask": null,
    "lastDirectUserMessage": { "text": "Clean the build output", "origin": "composer" },
    "omittedTaskContext": []
  }
}
```

The CLI writes `{"decision":"allow"}`, `{"decision":"deny","reason":"[Rule Name] text"}`, or
nothing. Nothing keeps the prompt. `parse-decision.ts` alone maps that output to Claude Code's
permission decision. The CLI and the mod ship together, so the CLI refuses a request in any other
shape, and the mod keeps the prompt.

Each optional task prompt has a 4,096-byte limit. An oversized task is omitted whole. If the
complete request exceeds 100,000 bytes, the client omits optional tasks before it refuses the
request. Policy, action, and current direct user evidence remain complete. The provider's token
limit still applies.

## Time limits

The mod passes `--jev-only`, which refuses Messages API providers and caps Jev's API timeout at 5
seconds. The child process has an 8-second limit, reduced to leave 250 ms within the handler's
remaining budget. A shared deadline ends evaluation 500 ms before that outer limit. The key helper
uses the remaining deadline, and the API uses the time left after the helper, up to 5 seconds. This
leaves time to return the configured failure verdict. Cancellation stops the owned key helper and
its process group. The mod declines evaluation when fewer than 500 ms remain. It discards child
stderr and does not copy invalid output into diagnostics.

## Check the mod

Run the local gates with Claude Code 2.1.292 installed:

```bash
bun run check
bun run check:claude-mod
```

The mod gate stages its native event tests outside Bun's discovery tree, then runs plugin validation
and the native runner with a clean environment and isolated Claude configuration. It starts no
session and makes no network call. The TypeScript declarations cover the fields that this mod uses
from that Claude Code version.

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

Use an auto-mode executable from the same release as the mod; an older artifact preserves manual
approval. The `auto-mode.command` plugin setting accepts an executable name or absolute path as one
argument, without a shell. Point it at the reviewed artifact before the session test.

Test known allow, deny, ask, and failure cases before wider use. Keep the existing Claude permission
settings. Remove any auto-mode hook entry from Claude's settings: the CLI reads only the mod's
request and writes nothing for a hook payload. To stop the mod, exit the test session and start the
next session without `--plugin-dir`.

[Claude event semantics](https://code.claude.com/docs/en/plugins/mods/events#approve-or-refuse-a-tool-call-before-the-user-is-asked)
describe the permission chain and the decisions that mods can change.
