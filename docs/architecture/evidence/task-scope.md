# The task scope

The task scope is the set of things a task owns: the worktrees it may write, the branches it may
push, the pull requests it may change, and the checkout's own remotes. The
[containment check](../stages/containment.md) denies any write outside it that it can resolve from
the call, the [edit bypass](../stages/edit-bypass.md) allows edits inside it, and Jev reads its
summary as evidence. auto-mode builds the scope afresh for every call, as the union of the scope
sources the configuration lists, and each source answers from the call's context alone. No source
can hand a task the default branch, so a push to it is always a finding.

## The scope sources

Each source contributes worktrees, branches, pull requests or path globs, and never throws: a source
with nothing to say contributes nothing. The configuration chooses which sources run, and the
shipped default runs the first, the second and the fourth of these:

- **The current directory.** The worktree that holds the call's directory, or the directory itself
  outside a checkout, and its current branch.
- **What the session created.** The worktrees, branches and pull requests this session's own calls
  made, kept in the state directory ([what the session created](#what-the-session-created)).
- **Path globs.** Paths the configuration says every task owns, such as a shared scratch directory.
  A glob that covers every worktree defeats the check, so the configuration warns about one.
- **The atc session record.** atc, which spawns and coordinates agent sessions, writes one record
  per session outside anything the agent can write, and names its path in the session's environment.
  The record lists the workspace atc prepared, its branch, and further worktrees, branches and pull
  requests. auto-mode checks that the record belongs to this session, and reports a malformed record
  with one line on stderr.

The checkout itself supplies what no source decides: its remotes, which are always in scope, its
current branch and its default branch. Every task also owns the system's scratch space, such as
`/tmp`.

## The rules that join them

A branch name means nothing outside its repository, so the session and atc sources count a branch
only when it belongs to the same repository as the call's directory. The union then drops the
default branch. When the checkout's default branch is unknown, it drops the conventional names for
one, such as `main` and `develop`, instead. A pull request stays in scope only while its head branch
does and its repository is one of the checkout's remotes, so dropping a branch drops its pull
requests with it.

The scope is read from files, never by running git or `gh`, so loading it costs no process. When
loading it fails, the call has no scope: the containment check and the edit bypass both stand aside,
and Jev judges the call with no scope summary. That is different from an empty scope, which a
missing or unreadable session file gives, and which makes the containment check deny more.

## What the session created

An agent that creates a worktree and a branch for its task must be able to write to them, but
neither is its current directory until it moves there, and atc may not know about them. The session
source closes that gap from what the session's own calls did.

After a Bash call finishes without a deny, the mod checks its command against the scope commands the
shared contract lists: `git worktree add`, `git checkout`, `git switch`, `git branch` and
`gh pr create`. On a match, it runs `auto-mode record` with the session identity, the directory, the
call's start time, the command and the call's output. The CLI records only when the session source
is configured. It reads the command text for claims, such as a worktree path or a new branch name,
then confirms each claim against the checkout before the scope takes it:

- **A worktree** counts when its git link file appeared after the call started, and it resolves to
  the claimed path.
- **A branch** counts when its reflog opens with its creation, and both the reflog entry and the
  branch's ref file are dated after the call started.
- **A pull request** counts when its URL in the output matches a checkout remote, and `gh` dates its
  creation after the call started, allowing for the forge's clock.

An existing worktree, branch or pull request adds nothing, whatever the command printed, so a call
cannot claim scope by naming something that was already there. The CLI also refuses a record whose
start time is older than any Bash call can run, or later than now, because the mod sends a record
only for a call that just finished. A call that runs `auto-mode record` itself is a
[containment](../stages/containment.md#what-counts-as-a-write-target) finding, so the agent cannot
send a record of its own.

The session's subagents record in parallel processes into one file per session, so each record
reads, merges and writes the file under a lock file beside it, and replaces the file by a rename. A
lock left by a process that died is stale after a bounded age, and the next record removes it. A
record that cannot take the lock in time gives up: the CLI writes a note to stderr, and the session
loses only the scope that call would have added. The record command never writes to stdout and
always exits zero, because a record is not a verdict.
