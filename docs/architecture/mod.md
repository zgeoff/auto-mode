# The mod

The mod is a Claude Code plugin that sits in Claude Code's permission chain and turns a pending
prompt into a call to the auto-mode CLI. It hooks the permission check, lets the rest of the chain
decide first, and judges a call only when the chain's answer is to ask the user. An existing allow
or deny is final, so auto-mode never overrides a permission the user configured. Because auto-mode
reads no transcript, the mod also keeps in memory the session facts the CLI needs. Apart from
judging, it reports what a finished Bash call created when the command can create a worktree, a
branch or a pull request, whoever allowed the call, as [Recording scope](#recording-scope) says. For
where the mod sits in the path of a prompted call, see the [overview](./overview.md). For what the
task context means, see [the user message](./evidence/user-message.md).

## What the mod keeps

Claude Code loads the mod as raw TypeScript when a session starts, and again when the user reloads
plugins mid-session. The mod holds its state in memory:

- **The session identity,** from the session start and prompt events. Claude Code keeps the identity
  across a resume unless the session is forked, so the denial counts and the session scope, which
  the CLI keys by it, carry over.
- **The task context:** the last direct user message with its origin and its freshness, and the
  original user task. Each is marked when it is the session's opening prompt. A compaction keeps
  them, and a fresh start or a clear resets them.
- **The delegated task of each subagent,** from the agent spawn event.
- **The agent each running tool call belongs to,** so a subagent's call goes out under its own
  agent.

A reload of the mod loses all of it. Until the next session event gives the mod a session identity
again, it judges nothing and every prompt stays a prompt, because the CLI keys the denial counts and
the session scope by that identity.

## Judging a prompt

For a call the chain would prompt for, the mod builds the request and runs the CLI as a child
process with the request on stdin. It passes `--jev-only`, which caps the Jev and judge time limits
and is the only mode that accepts a deadline from the mod. The judge still runs in that mode. The
CLI stops each step of a run at its own time limit ([Jev](./stages/jev.md#failure),
[the judge](./stages/judge.md#time-and-failure)), and the child's time limit is the sum of those
limits over the longest run: Jev and two judge calls, each after its own key command. The contract
holds the step limits, so the CLI and the mod read the same ones. `--jev-only` lowers a configured
judge limit to the shared one. The mod passes the CLI a deadline just inside the child's limit, so
the CLI can still write its verdict, or decide to write none, before the mod kills it. Claude Code's
budget for the hook stands still while the subprocess runs, so a long Jev and judge exchange costs
the session no hook time.

The mod keeps the prompt without asking the CLI when the call is cancelled, when it has no session
identity, when too little of the hook budget is left to run the CLI, when the call is one it is not
tracking, or when the tool input is not an object. It keeps the prompt after the run when the CLI
exits non-zero, when its output is truncated, when the call was cancelled meanwhile, when the child
times out or fails to start, and when the output is not a verdict.

## The contract

The CLI and the mod ship together in one package, so both sides check the request and the verdict
strictly. When either side meets a shape it does not know, the mod keeps the prompt. The verdict is
one JSON object, or nothing:

```json
{ "decision": "deny", "reason": "[Rule Name] what the rule protects, and what clears it" }
```

An allow is `{"decision":"allow"}`, and a deny must hold a reason that is not empty. The mod accepts
exactly those two key sets and maps them to Claude Code's permission decision in one place. Claude
Code passes a deny reason to the agent as the tool's result, verbatim, and the agent carries on.

The request and verdict shapes, the scope record, the message origins and the scope commands live in
the mod's contract folder as plain TypeScript with no dependencies. Claude Code refuses a package
import in a hooks module, its own package included, so the mod imports only Claude Code's own module
and, by relative path, its own plugin's files. The CLI imports the same contract files, and a type
test fails when the CLI's schemas and the contract types disagree.

The mod never writes Claude Code's settings files, and it has one setting of its own: the command
that runs the CLI, `auto-mode` on `PATH` by default.

## Recording scope

The mod also reports what a session creates. When a Bash call finishes without a deny and its
command matches one of the contract's scope commands, the mod runs the CLI's record command. It
passes the command, the command's output and the call's start time, under a short time limit of its
own ([the task scope](./evidence/task-scope.md#what-the-session-created)). When a record fails, the
mod only writes a debug line, because a lost record costs the session the scope that call would have
added, never the call itself.
