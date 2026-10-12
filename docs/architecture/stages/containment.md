# Containment

The containment check keeps a task's writes inside what the task owns. It reads the write targets of
a call, such as the paths it writes, the branch it pushes and the pull request it comments on, and
denies the call as `Outside Task Scope` when any target lies outside the
[task scope](../evidence/task-scope.md). It never allows: a call with no finding moves on to the
next stage, so the check only removes calls from what the classifier sees. Its deny is final,
because it returns before Jev and the judge run, so no configured allow entry and no consent in the
user's message can clear it. The [denial budget](./denial-budget.md) still counts it.

## A deterministic reading of the call

The check reads the call's text and never the filesystem or the network, so it answers the same way
for the same call. That choice sets its limit: it judges only targets it can resolve from the text.
A path built from a variable, a command substitution or another user's home yields no finding, and
so does a relative path once the current directory is unknown. Those calls go on to Jev, which
judges them from the policy instead. A missed target is therefore a call the classifier sees, never
a call that runs unjudged.

The check follows a shell command segment by segment and tracks `cd`, so
`cd ../other && rm -rf build` resolves `build` against the other directory. A `cd` inside a pipeline
runs in a subshell, so a pipe anywhere in the command, outside quotes, leaves the directory unknown
from that point. The check reads the command with the same shell tokenizer the local rules and the
session scope use, so all three agree on where a word, a segment and a redirection end.

## What counts as a write target

Each finding has one of five kinds, and the deny reason holds the kind and the target:

- **Path:** the file tools' targets, output redirections, the programs that delete, move, copy or
  edit files in place, and git commands such as `commit`, `reset` or `checkout` run in a directory
  outside the scope. Creating a worktree or a branch is never a finding, so a task can make its own,
  and the [session scope](../evidence/task-scope.md#what-the-session-created) records it.
- **Branch:** a branch the task does not own that a call deletes or pushes, and every `--all` or
  `--mirror` push.
- **Remote target:** a push to a remote that is not the checkout's own, pull request and issue
  writes, `gh api` writes, uploads, remote shells, publishing, and infrastructure tools that change
  what they manage.
- **Credential or global setting:** the credential directories in the home directory, global git
  config, `gh auth`, secret stores and cloud identity commands.
- **Shared resource:** pruning Docker volumes, images or containers.

A write to a pull request passes only when the task owns that pull request in that repository. A
merge never passes, whoever owns the pull request, so every merge, through `gh`, the GitHub API or
an MCP tool, is a finding. `gh api graphql` counts as a read unless its query holds `mutation`, and
`gh api` with no method and no fields is a read.

A call that runs `auto-mode record` itself is a credential finding. The mod alone reports finished
calls, so a record the agent sends is a claim on scope the agent did not make
([the task scope](../evidence/task-scope.md#what-the-session-created)).

## What counts as in scope

A path is in scope when it lies in a worktree the task owns, in a path glob the configuration lists,
or in the scratch space every task owns. A worktree under the `.worktrees` folder of another, as
`.worktrees/<name>` sits inside the main checkout, belongs to its own task, so being inside the
parent checkout never puts it in the parent's scope. Any other checkout nested inside an owned
worktree counts as part of that worktree here, and the
[edit bypass](./edit-bypass.md#which-target-counts) sends an edit into it to Jev.

A branch is in scope when the task scope lists it, and the default branch never is. A push with no
branch named pushes the current branch, which is known only for the call's own directory, so a push
run with `git -C` elsewhere and no branch named yields no branch finding and goes to Jev. A remote
is in scope when it is one of the checkout's own remotes, by name or by repository.

## When the check does not run

The check needs the task scope, and the task scope is loaded fresh for every call. When loading it
fails, the check and the edit bypass are both skipped, and Jev judges the call with no scope
summary. A read-only local allow returns before the scope loads, so a read never meets the check.
