# Containment

The containment check keeps a task's writes inside what the task owns. It reads the write targets of
a call, such as the paths it writes, the branch it pushes and the pull request it comments on, and
denies the call as `Outside Task Scope` when any target lies outside the
[task scope](../evidence/task-scope.md). It never allows: a call with no finding moves on to the
next stage, so the check only removes calls from what the classifier sees. It returns before Jev
reads the configured allow entries, so none of them clears its deny. Only the user can, by naming
every target in a direct message, and then the judge decides whether the message asks for the action
([the user-named grant](#the-user-named-grant)). The [denial budget](./denial-budget.md) still
counts the deny.

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
from that point. The check reads the command with the same shell tokenizer the local rules, the
session scope and the evaluation anonymiser use, so all four agree on where a word, a segment and a
redirection end. A command substitution, and a heredoc that a shell reads as its script, run
commands of their own, so the check reads each one from the directory of the segment that runs it. A
shell reads a heredoc as its script only when it runs no `-c` string and the heredoc reaches the
descriptor its script comes from: standard input, or the descriptor that a script path such as
`/dev/fd/3` opens. The outer shell expands an unquoted heredoc before the inner shell reads it, and
a substitution's output can be any script text. The check therefore reads the substitutions of such
a body, and the body itself only when it holds none.

## The program table

The check reads each program call through one table entry per program, so a program it learns to
read is a new entry with its tests, never a new branch of code. A program the table does not list
yields no finding and goes to Jev. The reader splits the call's words by the entry, then applies the
entry's write rules to them. Two readings stay outside the table, because each reads more than one
program call: an `xargs` whose command takes no listed name runs that command as written, and a
branch list piped into a branch deletion is a sweep. A call that runs `auto-mode record` is read
beside its entry.

An entry splits the words this way:

- **Options:** every word that starts with a dash. A value option takes the next word as its value,
  or an attached value written as `--name=value` or `-Xvalue`. A short cluster such as `-Dc` sets
  each flag before its first value option, which takes the rest of the cluster or the next word. A
  directory option, such as `git -C`, also moves the directory every later relative path resolves
  against. Any other option is a flag.
- **Operands:** every other word, and every word after `--`. An entry that ends its options at the
  first operand, as `ssh` does for the command it runs on the host, reads every later word as an
  operand.
- **Subcommands:** when the first operand is a subcommand, that subcommand's entry reads the words
  after it and the outer entry's rules do not apply. An entry can also take any other subcommand
  whose word matches a pattern, as `aws iam` takes each verb that changes an identity.

A write rule applies when one of its write flags is given, none of its read flags is, each of its
word patterns matches a word of the call, and its option value condition, such as a write method,
holds. A condition the rule leaves out holds. A rule that writes the directory it runs in, as
`git commit` does, yields a path finding for that directory when it lies outside the scope. Any
other rule writes the values of its write options and the operands it selects:

- **All** operands, the **first**, or every operand **after the first**.
- **After the script:** every operand after the first, which is the script, or every operand when a
  script option gives the script, as `sed -e` does.
- **The destination:** the last of two or more operands, unless a write option such as
  `--target-directory` gives it.
- **The sources:** the operands that are not the destination, which a move writes too.

A rule can name a default target for a call that gives none, as a push with no refspec pushes
`HEAD`. The rule reads each target in a role, which decides the finding:

| Role           | A target yields                                                                  |
| -------------- | -------------------------------------------------------------------------------- |
| Path           | a path or credential finding when it lies outside the scope                      |
| Remote path    | the rule's finding for a `host:path`, and a path reading otherwise               |
| URL            | the rule's finding, unless every URL points at this machine                      |
| Remote command | the rule's finding, unless the host runs one listed read with no shell operator  |
| Branch         | a branch finding for a branch the task does not own                              |
| Remote         | a remote-target finding for a remote the checkout does not have                  |
| Refspec        | a branch finding for a destination branch the task does not own                  |
| Commit         | the rule's finding for any commit but the current one                            |
| Pull request   | the rule's finding with the number to grant, unless the task owns it             |
| Merge          | the rule's finding with the number to grant, whoever owns the pull request       |
| Forge path     | the rule's finding, unless the path writes an owned pull request without merging |

A pull request target takes its repository from the rule's repository options, and a flag the rule
lists as ungranting, such as `--admin`, drops the number a message could grant. A forge path that
matches the rule's credential pattern yields a credential finding instead. A rule with no target
yields its finding as it stands. The finding's target is the program and its subcommands, unless the
rule gives a text of its own, quotes the first operand, or quotes the whole call.

## Changing the reader

A change to how the check reads a program call cites a form from real capture data: a command from a
[request capture](../state-and-logs.md#the-request-capture), or from a corpus case whose source is
recorded ([corpora](../evaluation.md#corpora)). The change adds that form, anonymised, as a test,
and its pull request states where the form was seen. The rule covers a new table entry, a new
option, flag or subcommand in an entry, and a change to the reader itself, and it covers a fix that
removes a false finding as much as one that adds a missed finding.

A form that is only plausible stays unread. An unread form loses the check's deterministic deny and
nothing else: the call goes on to Jev, which judges it from the policy, and the judge reviews the
call only when Jev denies it. A call that Jev allows therefore runs with no second review, so an
unread form rests on Jev's reading of the policy. A reading for a form no agent runs changes no real
outcome, yet every later change to the reader must keep it working, so the reader grows only where
real calls lead it.

## What counts as a write target

Each finding has one of six kinds, and the deny reason holds the kind and the target:

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
- **Discarded work:** a hard reset onto any commit other than the current one, and a branch deletion
  fed by a branch list that only drops names, such as every branch but the current one.

A discarded-work finding stands inside the task's own worktree. A hard reset onto another commit
drops every commit after it that no other branch holds, and every uncommitted change. The text
cannot tell whether those commits were pushed, or whether the task made the changes, so the check
denies the reset and its reason points the agent at a fast-forward merge or a rebase, which keep
both. A plain hard reset onto the current commit drops only uncommitted changes, which the task
presumes its own in its own worktree, so it goes to Jev. A branch deletion that selects by exclusion
names no branch, so no message can have named the branches it deletes. An `xargs` in replacement
mode whose command holds no replacement token appends no listed name, so the check reads that
command as written, and a deletion of an owned branch passes. BSD `xargs -J` is no replacement mode
for this purpose: when no word of its command matches the token, it appends the listed names after
the command, so a sweep through `-J` gets the finding whatever its command names. A list that
selects by a pattern, or through a filter the check cannot read, names its branches, and Jev and the
judge decide whether the user named the same ones.

A write to a pull request passes only when the task owns that pull request in that repository. A
merge never passes, whoever owns the pull request, so every merge, through `gh`, the GitHub API or
an MCP tool, is a finding. `gh api graphql` counts as a read unless its query holds `mutation`, and
`gh api` with no method and no fields is a read. An MCP call that matches a
[reply channel](./reply-channel.md) of the task scope is the session's own message, never a finding.

A call that runs `auto-mode record` itself is a credential finding. The mod alone reports finished
calls, so a record the agent sends is a claim on scope the agent did not make
([the task scope](../evidence/task-scope.md#what-the-session-created)). The call runs it when
auto-mode is the program, or when a launcher starts it: a JavaScript runtime or package runner such
as bun or npx, or a process wrapper such as nohup or xargs. Another program whose operands name
auto-mode and record, such as a rename, runs nothing and gets no finding.

## What counts as in scope

A path is in scope when it lies in a worktree the task owns, in a path the launcher scope file
lists, in a path glob the configuration lists, or in the scratch space every task owns. A worktree
under the `.worktrees` folder of another, as `.worktrees/<name>` sits inside the main checkout,
belongs to its own task, so being inside the parent checkout never puts it in the parent's scope.
Any other checkout nested inside an owned worktree counts as part of that worktree here, and the
[edit bypass](./edit-bypass.md#which-target-counts) sends an edit into it to Jev.

A branch is in scope when the task scope lists it, and the default branch and the configured
protected branches never are. A push with no branch named pushes the current branch, which is known
only for the call's own directory, so a push run with `git -C` elsewhere and no branch named yields
no branch finding and goes to Jev. A remote is in scope when it is one of the checkout's own
remotes, by name or by repository.

## The user-named grant

A user can hand the task a target on the spot by asking for the action on it in a direct message,
such as "create `.worktrees/label-check/label.test.ts` with one test". When the current direct
message names every target of a finding, the check leaves the deny pending for
[the judge](./judge.md#a-containment-deny) instead of returning it, and the judge clears the finding
only when the message asks for this operation on these targets. A name is necessary and never
sufficient, because a name cannot tell a target to write from a source to read: "port the formatter
from the export-csv worktree" names the export-csv worktree, and a write into it still stays denied
when the judge confirms.

A message names a target in one of four ways:

- **A path** by the path itself, written in full or from `~`, by a directory above it inside the
  same worktree, or by the name of the worktree that holds it. A directory never names a worktree
  nested in its `.worktrees` folder, and the home directory and the directories above it name
  nothing.
- **A branch** by its exact name.
- **A pull request** by its number written as `#512`, `PR 512` or a pull request URL.
- **Every other finding** by no word at all, so it stays final: a credential or global setting, a
  shared resource, discarded work, a push to a remote the checkout does not have, a git write run in
  another checkout, whose branch the text does not show, and a remote write with no pull request
  number.

The grant never covers the default branch, a conventional default name or a configured protected
branch, whatever the message says, and never an admin merge, because an admin merge bypasses the
forge's own branch protection. A stale message, one a relayed turn left behind, names nothing, and
neither does the message of a subagent's call ([the user message](../evidence/user-message.md)). A
run that skips the models and a configuration with the judge turned off keep every containment deny.

The call continues down the path with the deny pending, as a call with no finding would, and the
[edit bypass](./edit-bypass.md) passes it on, because the target still lies outside the task scope.
Jev then reads the call, and one judge review reads the pending deny beside any Jev deny, so a
prompted call never waits on two judge reviews. An overturn of the pending deny clears the scope
finding and nothing else, so a hard rule or a secret in the new content still denies the call. A
confirmed deny carries the judge's reason; a held or failed review keeps the check's own reason.

## When the check does not run

The check needs the task scope, and the task scope is loaded fresh for every call. When loading it
fails, the check and the edit bypass are both skipped, and Jev judges the call with no scope
summary. A read-only local allow returns before the scope loads, so a read never meets the check.
