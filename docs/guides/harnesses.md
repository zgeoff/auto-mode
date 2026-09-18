# Harnesses

auto-mode runs in Claude Code, Codex, and Muse Code. All three were verified end
to end: the hook denied a real tool call and the harness stopped it.

The verdict contract is the same for all three. Registration is not. Each
difference below stops the hook running if you get it wrong, and none of them
reports an error. `auto-mode init <harness>` prints the right entry and the
requirement.

## Claude Code

```sh
auto-mode init claude
```

Paste the `hooks` block into `~/.claude/settings.json`, or into
`.claude/settings.json` to scope it to one project.

The matcher is a regular expression tested against the tool name, so every tool is
`".*"`. Two near-misses leave the hook installed and never firing:

- `"*"` is not a valid regular expression.
- `""` matches only a tool whose name is the empty string.

Claude's own permission settings are consulted first. A tool they already deny is
refused before the hook sees it, so auto-mode can only narrow what Claude Code
would otherwise have allowed.

`--dangerously-skip-permissions` skips hooks as well, so auto-mode does not run
under it.

## Codex

```sh
auto-mode init codex
```

Merge the `hooks` block into `~/.codex/hooks.json`, and set `hooks = true` in
`~/.codex/config.toml`.

Codex registers a bare handler list with no `matcher` key.

Codex will not run an untrusted hook. It is skipped, without a message, until you
trust it once when Codex prompts you; the answer is recorded under `[hooks.state]`
in `config.toml`. Automation that already vets its hook sources can pass
`--dangerously-bypass-hook-trust`.

A denied call is reported to the agent as
`Command blocked by PreToolUse hook: [Rule Name] …`.

## Muse Code

```sh
auto-mode init muse
```

Add the `hooks` block to `~/.config/muse/settings.json`. No experimental flag is
needed.

A user-tier Muse handler takes `type` and `command` and nothing else. Adding
`timeout_ms` makes Muse report an unknown handler field and skip the whole
handler, so the hook reads as installed and never runs. `managed_hooks_env_vars`
is policy-tier and is refused outright.

Muse takes `""` to mean every tool, the opposite of Claude. The same value means
two different things in the two files.

Muse runs hook commands with a scrubbed environment, so no exported variable
reaches the hook and the API key has to come from `provider.apiKeyCommand`. See
[Configuration](./configuration.md).

Muse reports `transcript_path` as null on every event, so the classifier judges a
Muse action with no conversation history. The action is still matched against the
full policy; only the transcript is missing.

A denied call is reported to the agent as
`tool blocked by hook: [Rule Name] …`.

## Identifying which is which

auto-mode does not need telling. It reads the payload:

| Harness | Key |
|---|---|
| Muse | `model_provider` |
| Claude | `prompt_id` |
| Codex | `turn_id` |

Muse also sends `turn_id`, so it is tested first. A payload matching none of them
gets no verdict, and the harness decides for itself.
