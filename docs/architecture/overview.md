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

```text
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
 tier 2: Jev ──► allow / deny / ask ──► write verdict
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

**Tier two** uses Jev's typed decision API. The request includes the base policy, explicit user
Claude rules, the complete proposed action, and the last direct user message. It excludes other
conversation entries, tool output, assistant claims, and the raw hook envelope. The client sends a
Bearer-authenticated POST to `/v1/systemone`.

Each named shipped or configured block rule has a Choice question with `allow`, `block`, and `ask`
options. Questions share the same state. The response must contain every requested answer, valid
probabilities, and a supported choice. An invalid answer set is a classifier failure.

The caller combines the answers with hard blocks before soft blocks. A block needs both its
confidence and selected probability at or above `minConfidence`. Any uncertain answer or explicit
`ask` returns manual approval. Approval needs a confident allow from every question. Block messages
include the matching rule; Jev supplies no generated explanation.

The client refuses a request larger than 100,000 bytes before it calls the API. It does not truncate
the action or user message. The provider enforces its token limits; a rejected request follows
`onFailure`.

The Messages API presets use the generative framework and transcript reader. Their cache and
output-token handling apply only to that protocol.

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

## Permission evidence

The rule importer reads only explicit `autoMode` arrays from the user's Claude settings. `$defaults`
refers to the shipped policy. It imports no credential fields or shell permission patterns.
Configured hard and soft deny entries bypass local allowances so the model evaluates those
restrictions even for a read-only action.

The transcript reader selects the last direct user text. It ignores assistant messages, tool-result
messages, metadata, subagent messages, and atc message envelopes. A missing transcript supplies no
user message. It keeps the message whole; the request limit handles oversized input.

The last user message can supply specific consent required by a soft block. It cannot redefine the
policy or supply an unseen proposal. Earlier conversation grants, restrictions, ownership, and
interruptions are outside the assessment. The classifier asks for manual approval when facts about
the supplied action are needed and absent; it does not ask about every possible unseen event.

## Failure modes

- **A hook that cannot start fails open.** If the command is missing or crashes, the harness logs it
  and carries on. `onFailure: "deny"` does not help, because the process never runs.
- **auto-mode can only narrow what the harness already allows.** A tool the user's own permission
  settings deny is refused before the hook sees it.
- **The agent's own judgement comes first.** A model that refuses to issue a command means the hook
  is never consulted for it.
- **A model call can time out.** The default is to write nothing, report the failure on stderr, and
  let the harness decide. `onFailure: "deny"` fails closed instead.
- **A harness timeout shorter than the model call makes every hard case a silent failure.** `init`
  emits 90 seconds for this reason.
