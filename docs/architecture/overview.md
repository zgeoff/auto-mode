# Overview

auto-mode is a core library and a Claude Code mod. When Claude Code is about to prompt for a tool
call, the mod runs the auto-mode CLI, hands it the pending call on stdin, and reads a verdict on
stdout. Other software calls `classifyAction` from the library directly.

## Why it exists

Claude Code's built-in auto mode judges each action, so an agent can work unattended and stop only
at what matters. It runs for Claude.

Point the same harness at another model through an Anthropic-compatible gateway — GLM, Kimi, Muse
Spark — and the judging stops. The harness still runs the tools and the agent still works, but every
action needs approval again. auto-mode supplies that judging through a Claude Code mod.

The prompt targets models that are not Claude, so it has to survive a colder reader than Anthropic's
own. Codex and Muse Code each ship a built-in auto mode of their own, so auto-mode targets Claude
Code only, and a Muse model reaches it through the mod inside Claude Code. The
[decision model](./decision-model.md) is the approved design for what each stage decides; this
overview describes the code as it runs.

## The two tiers

```text
mod request on stdin
      │
      ▼
 parse ──► not a mod request ──► write nothing
      │
      ▼
 tier 1: local rules ──► allow ──► write allow          (< 1 ms)
      │
      │ escalate
      ▼
 tier 2: Jev ──► allow / deny ──► write verdict
      │
      │ failure
      ▼
 defer (write nothing) or deny, per config
```

**Tier one** matches deterministically and answers allow or escalate. It never denies on a prose
rule, because the two errors cost differently: a wrong allow costs one unwatched action, while a
wrong deny stops work the user asked for, and the rules that deny are prose that needs a reader. The
only local deny the decision model permits is a concrete scope finding: a write target outside the
task scope, named in the deny.

It allows three things — read-only tools by name, read-only shell commands including reporting `git`
subcommands, and deleting regenerable build output inside the working tree. A chain is allowed only
if every part of it is.

It declines to judge anything it cannot account for. Command substitution, backticks, process
substitution, output redirection, and an unbalanced quote all escalate.

**Tier two** uses Jev's typed decision API. The request includes the base policy, explicit user
Claude rules, the complete proposed action, and the last direct user message. The
[Claude mod](../guides/claude-mod.md) supplies that message and bounded task context with explicit
origins. The request excludes other conversation entries, tool output, and assistant claims. The
client sends a Bearer-authenticated POST to `/v1/systemone`.

For Git actions and Write/Edit calls, the evaluator also reads cwd branch references, including
linked worktree metadata. It omits those references when inherited Git directory overrides exist.
These references describe cwd only, not the edited file's checkout or a generated script's future
execution cwd. Ordinary non-Git source edits need no branch evidence to settle Default Branch Write;
delayed Git effects need evidence for their actual targets. The local `origin/HEAD` reference can be
stale; the evaluator does not refresh the remote. Branch evidence supplies no consent and never
removes the named main/master/trunk/develop restrictions.

Each named shipped or configured block rule has a Choice question with `allow`, `block`, and `ask`
options. Questions share the same state. The response must contain every requested answer, valid
probabilities, and a supported choice. An invalid answer set is a classifier failure.

The caller combines the answers with hard blocks before soft blocks. A block needs both its
confidence and selected probability at or above `minConfidence`. Approval needs a confident allow
from every question. Any other combination, an uncertain answer or an explicit `ask`, is a deny that
names the unsettled rule with the highest block probability. Jev supplies no generated explanation,
so every deny carries a fixed reason for its rule: the harm the rule covers and what clears it.

The client refuses a request larger than 100,000 bytes before it calls the API. It can omit optional
task context to fit the request, with an explicit reason. It does not truncate the action or user
message. The provider enforces its token limits; a rejected request follows `onFailure`.

The Messages API presets use the generative framework, with the mod's last direct user message as
their only history. Their cache and output-token handling apply only to that protocol.

## Writing nothing

Writing nothing is a verdict, not a failure. It means auto-mode has no opinion, and the mod keeps
the prompt Claude Code was about to show. That is the output for a body that is not a mod request,
for a body that is not JSON, and for a model call that failed under `onFailure: "defer"`.

## The mod contract

The mod hooks `tool.check`, calls the rest of the permission chain first, and judges only an `ask`.
An existing allow or deny is final, with its reason and rule. Claude Code reaches the mod only for a
call it would prompt for, so auto-mode can only answer prompts; it never overrides the user's own
permission settings.

The request carries the session identity, the tool-call identifier, the current directory, the
complete action, and the task context. The mod reads `session_id` from `classic.SessionStart` and
`classic.UserPromptSubmit`; Claude Code's `--resume` keeps it unless `--fork-session` is passed.

The verdict is one JSON object or nothing:

```json
{ "decision": "deny", "reason": "[Rule Name] text" }
```

An allow is `{"decision":"allow"}`. The reason begins with the rule name in brackets, and Claude
Code passes it to the agent verbatim. The mod's `parse-decision.ts` alone maps this output to Claude
Code's permission decision. The CLI and the mod ship together, so each refuses the other's output in
any other shape, and a refusal keeps the prompt. Exit 0; the JSON alone decides the outcome.

## Permission evidence

The rule importer reads only explicit `autoMode` arrays from the user's Claude settings. `$defaults`
refers to the shipped policy. It imports no credential fields or shell permission patterns.
Configured hard and soft deny entries bypass local allowances so the model evaluates those
restrictions even for a read-only action.

The mod captures the last direct user message from Claude Code's prompt event, with its composer,
Remote Control, or SDK origin. A message from another origin, such as a plugin delivery, does not
replace it. A child agent's request carries no direct user message. auto-mode reads no transcript. A
missing message supplies no user evidence. The message stays whole; the request limit handles
oversized input.

The last user message can supply specific consent required by a soft block. It cannot redefine the
policy or supply an unseen proposal. Earlier conversation grants, restrictions, ownership, and
interruptions are outside the assessment. The classifier denies when facts about the supplied action
are needed and absent; it does not deny over every possible unseen event.

## Failure modes

- **A CLI that cannot start keeps the prompt.** If the executable is missing, crashes, or exits
  non-zero, the mod keeps the prompt. `onFailure: "deny"` does not help, because the process never
  runs.
- **auto-mode can only answer prompts.** A tool the user's own permission settings allow or deny
  never reaches the mod.
- **The agent's own judgement comes first.** A model that refuses to issue a command means the mod
  is never consulted for it.
- **A model call can time out.** The default is to write nothing, report the failure on stderr, and
  keep the prompt. `onFailure: "deny"` fails closed instead.
- **The mod's time limit bounds the model call.** The child process has 8 seconds and Jev 5; a
  slower call keeps the prompt. [Time limits](../guides/claude-mod.md#time-limits) has the detail.
