# Settings and repository facts

Jev judges a call against facts it could otherwise only guess from names: which branch the checkout
is on, which remotes are the checkout's own, which MCP servers the user configured, and which rules
the user wrote. auto-mode reads these facts from the machine for every call and sends them with the
request, so that a push to the checkout's own remote, or a call to an MCP server the user set up, is
compared with the configuration rather than judged by how familiar its name looks. Every fact here
leaves the machine in the request, so each loader sends the least that settles the question and
strips anything that can hold a credential. [The task scope](./task-scope.md) owns the worktrees,
branches and pull requests the task owns, and [the user message](./user-message.md) owns the
conversation evidence.

## The user's own rules

The user's Claude settings can hold an `autoMode` block with four lists: environment facts, allow
entries, soft deny entries and hard deny entries. auto-mode imports those four lists and nothing
else from the settings: no credential fields and no shell permission patterns. A `$defaults` entry
in a list refers to auto-mode's shipped policy, so the importer drops it rather than sending it as a
rule. Jev reads the environment and allow entries as context, and asks each deny entry as a block
rule of its own in its tier ([Jev](../stages/jev.md#the-request)). A soft deny entry clears with a
specific instruction from the user, and a hard deny entry clears only by changing the configuration.

Deny entries change the path. The local rules and the edit bypass decide without reading the user's
rules, so when any deny entry exists, both stages stand aside. The containment check still runs and
denies a write it can resolve outside the task scope, and every other call reaches Jev. A user who
writes a deny entry about reading a file therefore gets it enforced, at the cost of a Jev call for
every read.

A missing settings file means no user rules. A settings file that exists but cannot be read or
parsed is a classifier failure for every call, read-only calls included, because judging without the
user's deny entries would drop a restriction the user wrote.

## The repository facts

For every call, auto-mode reads the facts of the git checkout that holds the call's directory: its
current branch, its default branch, and its configured remotes. It reads them from the files under
the checkout's git directory, never by running git, so the read costs no process and runs no hook.
Linked worktrees resolve through their own git metadata to the shared repository. The default branch
comes from the local `origin/HEAD` reference, which can be stale, and auto-mode never refreshes it
from the remote.

A remote URL can hold a token as its user info, so the loader sends only the host and path of each
remote, and leaves out a URL it cannot parse rather than sending what the URL might hold. When the
task scope loaded, the facts also carry its summary: the worktrees, branches and pull requests the
task owns.

The facts describe the call's own directory and nothing else. A call that runs `git -C` against
another checkout, edits a file in another checkout, or writes a script that runs later somewhere
else gets no facts about that other place, and the guidance Jev reads for the default-branch rule
makes that limit explicit. When a git directory override is set in the environment, git works on
another checkout than the one the directory sits in, so auto-mode sends no repository facts at all.

## The MCP servers

auto-mode lists the MCP servers that Claude Code would run for the session, read from Claude Code's
own configuration: the user and local servers in the user's Claude configuration file, and the
servers of the checkout's `.mcp.json` that the user approved. An approval counts only from outside
the checkout, so a repository cannot approve the servers its own `.mcp.json` declares. When two
definitions share a name, the local one wins over the project one and the project one over the user
one, as in Claude Code.

Each server goes out as its name, its scope, its transport and the host of its endpoint. Its
command, arguments, environment, headers, and the user info, path and query of its URL stay on the
machine, because any of them can hold a credential. The loader reads each entry field by field, so a
credential never enters the result to be stripped later. Jev compares a call to
`mcp__<server>__<tool>` with this list. Servers from plugins, managed configuration and the
`--mcp-config` flag are not in it.

Failing to read the repository facts or the MCP servers costs only those facts: the request goes
without them, and the call is not a failure.
