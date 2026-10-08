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
 tier 1: local rules ──► read-only allow ──► write allow          (< 1 ms)
      │
      │ escalate, or another local allow
      ▼
 containment check ──► write outside the task scope ──► deny ──┐
      │                                                        │
      │ no finding, or a target it cannot resolve              │
      ▼                                                        │
 local allow? ──► write allow                                  │
      │                                                        │
      ▼                                                        ▼
 tier 2: Jev ──► allow / deny ──┐
      │                         │
      │ failure                 ▼
      ▼                   denial budget ──► write verdict
 defer (write nothing)          │
 or deny, per config            └──► budget spent: write nothing (the user is asked)
```

**Tier one** matches deterministically and answers allow or escalate. It never denies on a prose
rule, because the two errors cost differently: a wrong allow costs one unwatched action, while a
wrong deny stops work the user asked for, and the rules that deny are prose that needs a reader. The
only local deny is a concrete scope finding: a write target outside the task scope, named in the
deny, from the containment check described below.

It allows three things — read-only tools by name, read-only shell commands including reporting `git`
subcommands, and deleting regenerable build output inside the working tree. A chain is allowed only
if every part of it is.

It declines to judge anything it cannot account for. Command substitution, backticks, process
substitution, output redirection, and an unbalanced quote all escalate.

**The containment check** runs after a read-only allow and before every other allow: the local
regenerable-output allow, configured allow entries, and Jev. It reads the action's write targets
(paths written, moved or deleted, branches deleted or pushed, pull requests merged, closed or
commented on, remotes pushed to, credentials and global settings changed) and denies any target
outside the task scope as the rule `Outside Task Scope`, naming the target. No later stage or
configured allow entry can clear that deny. It never allows: an action with no finding moves on, and
so does a target it cannot resolve from the command text, such as a path held in a variable, which
Jev judges. It reads `gh api graphql` as a read unless the query carries `mutation`.

The task scope is the union of the scope sources in the `scopeSources` registry; each source answers
from the action's context alone, behind one interface. The `cwd` source owns the worktree that holds
the action's directory (outside a checkout, the directory itself) and its branch. The `session`
source owns the worktrees and branches the session created and the pull requests it opened whose
head branch is in scope; the mod reports each Bash call that can create one after it runs, and the
CLI keeps what the call made in a file per session ID. The `globs` source owns configured path
globs. The `atc` source is reserved for atc's general session record and contributes nothing yet. No
source can hand a task the default branch. The checkout's remotes are always owned, and `/tmp` is
scratch space that every task owns. [Configuration](../guides/configuration.md#scope-sources) lists
the sources.

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

## The denial budget

Every verdict passes through the denial budget before it is written. auto-mode counts denials per
session, and each subagent keeps its own count, in a file under `$XDG_STATE_HOME/auto-mode/denials/`
keyed by the session and agent identifiers, so the counts survive a reload of the mod and a resumed
session. An allow resets the consecutive count. A retry of the action just denied is denied again
from the stored rule and reason, without a classifier call, so a classifier cannot be asked until it
allows.

Each deny reason ends with the denials left. The last deny before a limit tells the agent to stop
and report what consent it needs. The action that would exceed either limit (3 in a row, 20 per
session, both configurable) gets no verdict, so the mod keeps Claude Code's prompt and the user
decides. The CLI never sees that answer, but the next request can only arrive after it, so both
counts restart at zero when the action is escalated. The action log records the deciding stage, the
counts and each escalation; [Action diagnostics](../guides/diagnostics.md) lists the fields.

## Writing nothing

Writing nothing is a verdict, not a failure. It means auto-mode has no opinion, and the mod keeps
the prompt Claude Code was about to show. That is the output for a body that is not a mod request,
for a body that is not JSON, for a model call that failed under `onFailure: "defer"`, and for the
action that exceeds the denial budget.

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

An allow is `{"decision":"allow"}`. The reason begins with the rule name in brackets, then the harm
the rule covers and what clears it, and ends with the instruction in `policy/denial.md`: do not
reach the same result another way, continue on a safer path, and when none exists, finish the rest
of the task before telling the user what the blocked step needs. Claude Code passes the reason to
the agent verbatim, and the agent continues. The mod's `parse-decision.ts` alone maps this output to
Claude Code's permission decision. The CLI and the mod ship together, so each refuses the other's
output in any other shape, and a refusal keeps the prompt. Exit 0; the JSON alone decides the
outcome.

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
