# Overview

auto-mode is a hook. The harness runs it before a tool executes, hands it the pending call on stdin,
and reads a verdict on stdout.

## Why it exists

Claude Code's built-in auto mode judges each action, so an agent can work unattended and stop only
at what matters. It runs for Claude.

Point the same harness at another model through an Anthropic-compatible gateway — GLM, Kimi, Muse
Spark — and the judging stops. The harness still runs the tools and the agent still works, but every
action needs approval again. auto-mode supplies that judging through an interface the harness
already calls.

Two constraints follow. The prompt targets models that are not Claude, so it has to survive a colder
reader than Anthropic's own. And it targets three harnesses, so nothing may depend on a feature only
one of them has.

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

**Tier one** matches deterministically and answers allow or escalate. It never denies, because the
two errors cost differently: a wrong allow costs one unwatched action, while a wrong deny stops work
the user asked for, and the rules that deny are prose that needs a reader.

It allows three things — read-only tools by name, read-only shell commands including reporting `git`
subcommands, and deleting regenerable build output inside the working tree. A chain is allowed only
if every part of it is.

It declines to judge anything it cannot account for. Command substitution, backticks, process
substitution, output redirection, and an unbalanced quote all escalate.

**Tier two** sends the policy as the system prompt and the action as the user turn, then reads
`<block>yes</block>` or `<block>no</block>` back.

Every ambiguity in that answer resolves to allow, following the policy's own reasoning: a block
nobody can name is a false positive, and a false positive costs more than the action it stopped. A
model that says yes and names no rule has given the user nothing to read and nothing to appeal.

The user turn carries the transcript first and the pending action last, under a label. The policy
tells the classifier to judge the most recent action and to read everything before it as context, so
the ordering is what makes that instruction resolvable.

The client is a bare `fetch` against `/v1/messages` rather than an SDK. This runs once per tool
call, so process start-up sits on the critical path, and every supported provider serves the same
endpoint shape.

## Writing nothing

Writing nothing is a verdict, not a failure. It means auto-mode has no opinion and the harness does
whatever it would have done alone. That is the output for an unknown harness, for an event that is
not a tool gate, for a body that is not JSON, and for a model call that failed under
`onFailure: "defer"`.

## Identifying the harness

The three payloads overlap, so the order of these checks decides the result.

| Harness | Key              | Note                                         |
| ------- | ---------------- | -------------------------------------------- |
| Muse    | `model_provider` | Neither other harness sends it               |
| Claude  | `prompt_id`      |                                              |
| Codex   | `turn_id`        | Muse sends this too, so Muse is tested first |

Environment variables cannot help. Muse runs hook commands with a scrubbed environment, so a Muse
hook sees none of them — which is also why a Muse setup resolves its API key through a command
rather than a variable.

## The verdict contract

Two events, two shapes. The tool gate takes a flat decision, and all three harnesses read it,
because Codex and Muse both modelled their hook contract on Claude's:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "[Rule Name] one sentence."
  }
}
```

Claude Code's permission request takes a nested one, and drops the flat spelling without reporting
it — an allow written that way leaves the call waiting for the prompt it was meant to answer:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": { "behavior": "deny", "message": "[Rule Name] one sentence." }
  }
}
```

That event carries allow and deny and nothing else, because it fires when the harness is already on
its way to the prompt. An ask on it is that prompt, which is what happens when the hook writes
nothing — so writing nothing is what auto-mode does with one.

`hookSpecificOutput` wraps both. Exit 0; the JSON alone decides the outcome.

The reason begins with the rule name in brackets, and that text reaches the agent verbatim. Verified
in all three harnesses, and on both of Claude Code's events.

## Prompt caching

The policy is identical on every call, so it is the cache prefix and carries
`cache_control: {"type": "ephemeral"}`. Measured on Muse Spark: the first call pays about 7,000
input tokens, and a repeat reads 7,025 from cache and pays 42 new.

The transcript is appended after the policy, and only its tail is included, so the prefix grows by
appending rather than sliding. A sliding window would change the cached prefix on every call and pay
full price each time.

## Failure modes

- **A hook that cannot start fails open.** If the command is missing or crashes, the harness logs it
  and carries on. `onFailure: "deny"` does not help, because the process never runs.
- **auto-mode can only narrow what the harness already allows.** A tool the user's own permission
  settings deny is refused before the hook sees it.
- **The agent's own judgement comes first.** A model that refuses to issue a command means the hook
  is never consulted for it.
- **A model call can time out.** The default is to write nothing and let the harness decide.
  `onFailure: "deny"` fails closed instead.
- **A harness timeout shorter than the model call makes every hard case a silent failure.** `init`
  emits 90 seconds for this reason.
