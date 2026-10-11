# The edit bypass

The edit bypass allows a file edit inside the task's own worktree without asking Jev. Most of an
agent's calls are edits to the code it was asked to change, and the policy's rules describe
catastrophic harm, which an ordinary edit there is not. Asking Jev about each one costs a model call
per edit and risks a wrong deny. The bypass therefore allows an Edit, Write or NotebookEdit call
whose target lies in a worktree the task owns, unless the target is a file whose change can disable
a guard, or the new content holds a secret. Every case the bypass does not allow goes to Jev, never
to a deny, so the bypass can only remove calls from what Jev sees. Shell writes always go to Jev,
because the bypass judges a file the tool names and a shell command names none it can trust.

The bypass runs after the [containment check](./containment.md), so an edit whose target lies
outside the task scope is already denied, and the bypass sees only edits that are inside the scope
or that containment could not resolve.

## Which target counts

A link inside a worktree can point anywhere, so the bypass compares real paths. It resolves the
target to the real path of its deepest part that exists, plus the parts not created yet, and treats
a dangling link as a target it cannot resolve. It then takes the deepest worktree the task owns that
holds the resolved target, and requires the git checkout found from the target's own directory to be
that same worktree. An edit into a nested `.worktrees/` checkout, or into another checkout that
happens to sit inside an owned worktree, therefore goes to Jev.

Some targets go to Jev even inside the scope, because changing them can change what guards the
agent, what runs later, or what holds credentials:

- auto-mode's own configuration and state directories
- git metadata
- agent configuration, such as `.claude/`, `AGENTS.md` and `CLAUDE.md`, and settings files
- hook files and CI workflows
- env files and credential files

The bypass checks both the path as written and the path it resolves to, because a link can give an
excluded name an ordinary target, or an ordinary name an excluded one.

## The secret scan

The bypass scans the new content with the Betterleaks rule set, and any match sends the edit to Jev.
The rule set is Betterleaks' own, compiled from its rule file into a bundled JSON file by a script
in the repo, because the CLI runs under node with bundled dependencies and cannot ship the
Betterleaks binary. Rules that backtrack badly on hostile input run on a linear-time regex engine
instead of V8's. The CLI loads the rule set only for a file edit that reaches the bypass, so every
other call starts without it. The scan never sends a match to its provider to validate it, because
validation would send the secret to a third party.

The bypass scans a Write or NotebookEdit call as its whole new content, and an Edit call in the file
it produces: the bypass reads the current file, applies the replacement, and scans the lines around
each replaced span, because a rule can need the text around a value, such as the assignment a key
sits in. An Edit whose old text is not in the file, or whose file cannot be read, goes to Jev.
Content larger than the scan's size cap goes to Jev unscanned, rather than scanned in part. A path
that Betterleaks itself never scans, such as an image or a `go.sum` file, passes the scan.

## When the bypass is off

The bypass does not run in three cases, and each sends every edit to Jev:

- **The user's Claude settings hold block entries.** Only Jev reads those entries
  ([settings and repository facts](../evidence/settings-and-repository.md)), so a bypassed edit
  could skip a restriction the user wrote.
- **The task scope did not load.** With no scope there is no owned worktree to compare against.
- **A git directory override is set in the environment.** With `GIT_DIR`, `GIT_WORK_TREE` or
  `GIT_COMMON_DIR` set, git works on another checkout than the one a path sits in, so the bypass
  cannot know which checkout a target belongs to.

Any error inside the bypass, such as a file it cannot read, also sends the edit to Jev.
