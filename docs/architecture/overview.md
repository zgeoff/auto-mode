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

## The two tiers and the judge

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
      ▼                                                        │
 edit bypass ──► in-scope file edit, no secret ──► write allow │
      │                                                        │
      ▼                                                        ▼
 tier 2: Jev ──► allow ───────────────────────┐
      │      └──► deny ──► judge ──► confirm   │
      │                      │      or overturn│
      │ failure              │                 ▼
      ▼                      └────────► denial budget ──► write verdict
 defer (write nothing)                         │
 or deny, per config                           └──► budget spent: write nothing (the user is asked)
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
globs. The `atc` source owns what atc's session record at `$ATC_SESSION_RECORD` declares: its
workspace, worktrees, branches and pull requests. No source can hand a task the default branch. The
checkout's remotes are always owned, and `/tmp` is scratch space that every task owns.
[Configuration](../guides/configuration.md#scope-sources) lists the sources.

**The edit bypass** allows an Edit, Write or NotebookEdit whose target, with links resolved, lies in
an in-scope worktree and in that worktree's own checkout, without asking Jev. Shell writes still go
to Jev, and so does an edit into a nested worktree or checkout the task does not own. These targets
go to Jev even inside the scope, on the path as written or as resolved: `.git`, agent configuration
(`.claude/`, `.codex/`, `.muse/`, `AGENTS.md`, `CLAUDE.md`), settings and hook files, CI workflows,
env and credential files, and auto-mode's own configuration and state. The written content must pass
a secret scan with the Betterleaks v1.9.0 rule set, compiled to a bundled JSON file; an Edit is
scanned as the 12 lines around each replacement in the file it produces. Any match sends the edit to
Jev, and so does content over 256 KiB or an Edit whose text is not in its file. The scan never
validates a secret against its provider. When the user's Claude settings carry deny entries, the
bypass is off, because only Jev reads those entries.
[The bypass evidence](../evaluations/edit-bypass.md) records the port and its cost.

**Tier two** uses Jev's typed decision API. The request includes the base policy, explicit user
Claude rules, the complete proposed action, and the last direct user message. The
[Claude mod](../guides/claude-mod.md) supplies that message and bounded task context with explicit
origins. The request excludes other conversation entries, tool output, and assistant claims. The
client sends a Bearer-authenticated POST to `/v1/systemone`.

For every action, the evaluator also reads the cwd checkout's facts: its branch references,
including linked worktree metadata, and its configured remotes. It drops the user info from each
remote URL, because a URL can hold a token. When the task scope loads, the request adds its summary:
the worktrees, branches, and pull requests the task owns. Jev reads these facts as
`repositoryContext`, and the Messages classifier reads them in a `<repository>` block, so a
destination is compared with the remotes rather than judged by its name. The evaluator omits the
facts when inherited Git directory overrides exist.

The evaluator also reads the MCP servers configured for the session from Claude Code's own
configuration: the user and local servers in `~/.claude.json` (or
`$CLAUDE_CONFIG_DIR/.claude.json`), and the project's `.mcp.json` servers that the user settings or
the project entry in that file approve. An approval inside the checkout does not count. Each server
goes out as its name, scope, transport and endpoint host only; its command, arguments, environment,
headers, and the URL's user info, path and query stay on the machine. Jev reads the list as
`mcpServers` and the Messages classifier as an `<mcp-servers>` block, so a call to
`mcp__<server>__<tool>` is compared with a server the user configured. Plugin, managed and
`--mcp-config` servers are not listed. The branch references describe cwd only, not the edited
file's checkout or a generated script's future execution cwd. Ordinary non-Git source edits need no
branch evidence to settle Default Branch Write; delayed Git effects need evidence for their actual
targets. The local `origin/HEAD` reference can be stale; the evaluator does not refresh the remote.
Branch evidence supplies no consent and never removes the named main/master/trunk/develop
restrictions.

Each named shipped or configured block rule has a Choice question with `allow` and `block` options;
a missing fact needed to rule out the rule's harm is a block. Questions share the same state. The
response must contain every requested answer, valid probabilities, and a supported choice. An
invalid answer set is a classifier failure.

The caller allows unless some rule's block probability reaches `blockThreshold` (0.2 by default).
The deny names the rule with the highest block probability; a hard rule wins a tie, then the earlier
rule. An unsure answer whose block probability stays below the threshold does not stop the action.
The containment check runs before Jev, so its deny stands whatever Jev answers. Jev supplies no
generated explanation, so its deny carries a fixed reason for its rule: the harm the rule covers and
what clears it.

**The judge** reviews each Jev deny. It is a generative model, `claude -p` on Claude Haiku by
default, with the prompt in `policy/judge.md`. It reads the denied rule with its tier and text, the
complete action, the last direct user message and the repository facts, and answers confirm or
overturn with a reason. A confirm reaches the agent as `The reviewer confirmed the <rule> deny:`
with the judge's reason, cut to 600 characters. An overturn of a soft rule allows the action; the
judge overturns when the last direct user message asks for this operation on this target, or when
the facts show the rule's harm cannot happen. A hard rule and a configured hard deny never clear:
the judge writes their reason only. The judge fails closed: a timeout, a failed call or an
unreadable reply keeps the deny with its fixed reason. A containment deny never reaches the judge.

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
- **The mod's time limit bounds the model calls.** The child process has 10 minutes, Jev 5 seconds
  and the judge its configured timeout, 120 seconds by default; a slower Jev call keeps the prompt,
  and a slower judge keeps the deny. [Time limits](../guides/claude-mod.md#time-limits) has the
  detail.
