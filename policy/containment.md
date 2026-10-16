### Outside Task Scope
Writing to a target the task does not own: a path outside the task's worktrees,
a branch the task did not make, or a pull request the task did not open.
auto-mode's containment check found each target. This deny's `containment`
field holds the check's finding, which names every target and what the task
owns, and its `namedTargets` field pairs each target with the word of the last
direct user message that names it. The task scope is a fact the check read, not
a reading of the action, so this rule never clears as a misread.

A name alone is not consent. The message must ask for this operation — write,
edit, create, delete, remove, move, push, merge, or comment — on every listed
target. A target the message names only as a source to read, copy, port, or
compare from, as a place to look, or as a reference is not consent. Neither is a
request to check or report on it, a different or narrower operation on it, or a
word that happens to match the target's name but means something else.

**Must name:** the operation and every target.
