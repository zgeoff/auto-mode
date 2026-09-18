# Overview

auto-mode answers one question, once per tool call: should this action run?

It is a hook. The harness runs it before a tool executes, hands it the pending
call on stdin, and reads a verdict on stdout. Everything below serves that.

## Why it exists

Claude Code ships an auto mode that judges each action, so an agent can work
unattended and only stop at the things that matter. It runs for Claude.

Point the same harness at another model — GLM, Kimi, Muse Spark, anything behind
an Anthropic-compatible gateway — and the judging goes away. The harness still
runs the tools and the agent still works, but every action needs a keypress
again. auto-mode puts the judge back, as something the harness already knows how
to call.

That shapes two decisions. It targets models that are not Claude, so the prompt
has to survive a colder reader than Anthropic's own. And it targets three
harnesses, so nothing may depend on a feature only one of them has.

## The two tiers

```
payload on stdin
      │
      ▼
 parse + identify harness ──► unknown ──► write nothing
      │
      ▼
 tier 1: local rules ──► allow ──► write allow          (< 1 ms)
      │
      │ escalate
      ▼
 tier 2: the model ──► allow / deny ──► write verdict    (2-24 s)
      │
      │ failure
      ▼
 defer (write nothing) or deny, per config
```

**Tier one** matches deterministically and answers allow or escalate. It never
denies. The asymmetry is the point: a wrong allow costs one unwatched action,
while a wrong deny stops work the user asked for, and the rules that deny are
prose that needs a reader.

It allows three things — read-only tools by name, read-only shell commands
including reporting `git` subcommands, and deleting regenerable build output
inside the working tree. A chain is only as allowable as its least obvious part.

It refuses to judge anything it cannot account for. Command substitution,
backticks, process substitution, output redirection, and an unbalanced quote all
escalate rather than being guessed at.

**Tier two** sends the policy as the system prompt and the action as the user
turn, then reads `<block>yes</block>` or `<block>no</block>` back.

Every ambiguity in that answer resolves to allow, following the policy's own
reasoning: a block nobody can name is a false positive, and a false positive
costs more than the action it stopped. A model that says yes and names no rule
has not made a case, so there is nothing to show the user and nothing to appeal.

## Identifying the harness

The three payloads overlap, so the order of these checks is load-bearing.

| Harness | Key | Note |
|---|---|---|
| Muse | `model_provider` | Neither other harness sends it |
| Claude | `prompt_id` | |
| Codex | `turn_id` | Muse sends this too, so Muse is tested first |

Environment variables cannot help. Muse runs hook commands with a scrubbed
environment, so a Muse hook sees none of them — which is also why a Muse setup
must resolve its API key through a command rather than a variable.

## The verdict contract

One shape works everywhere, because Codex and Muse both modelled their hook
contract on Claude's:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "[Rule Name] one sentence."
  }
}
```

`permissionDecision` must sit inside `hookSpecificOutput`. Exit 0 — the JSON
alone decides the outcome.

The reason begins with the rule name in brackets, and that text reaches the agent
verbatim. Verified in all three harnesses.

## Prompt caching

The policy is identical on every call, so it is the cache prefix and carries
`cache_control: {"type": "ephemeral"}`. Measured on Muse Spark: the first call
pays about 7,000 input tokens, and a repeat reads 7,025 from cache and pays 42
new.

The transcript is appended after the policy, and only its tail is included, so
the prefix grows by appending rather than sliding. A sliding window would change
the cached prefix on every call and pay full price each time.

## How this fails

Worth knowing before you trust it.

- **A hook that cannot start fails open.** If the command is missing or crashes,
  the harness logs it and carries on. `onFailure: "deny"` cannot help, because
  the process never runs.
- **It can only narrow what the harness already allows.** A tool your own
  permission settings deny is refused before the hook sees it.
- **The agent's own judgement comes first.** A model that refuses to issue a
  command means the hook is never consulted for it.
- **A model call can time out.** The default is to write nothing and let the
  harness decide. Set `onFailure` to `deny` to fail closed instead.
- **A harness timeout shorter than the model call turns every hard case into a
  silent failure.** `init` emits 90 seconds for this reason.
