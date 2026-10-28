# Declaring a session's scope

A program that starts Claude Code sessions, a launcher, can tell auto-mode what each session owns
before the session makes its first call. The launcher writes one JSON file per session in the format
this guide describes, and names the file in the session's environment as `AUTO_MODE_SCOPE_FILE`.
auto-mode reads the file on every call it judges and adds what the file declares to the
[task scope](../architecture/evidence/task-scope.md). The format belongs to auto-mode, so a launcher
needs no code from auto-mode and auto-mode needs none from the launcher.

## The format

The file is one JSON object. `format` and `version` are required, and every other field is optional.

| Field           | Holds                                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| `format`        | the string `auto-mode.scope`                                                          |
| `version`       | the number `1`                                                                        |
| `paths`         | absolute paths the session owns, each with everything below it                        |
| `workspace`     | the checkout the launcher prepared: `path` and `branch`                               |
| `worktrees`     | further checkouts the session owns, each with `path` and `branch`                     |
| `branches`      | further branches the session owns, each with `name` and an optional `repo`            |
| `pullRequests`  | pull requests the session owns, each with `repo`, `number`, `branch` and `url`        |
| `replyChannels` | recipients the session may message as its own, each with `tool`, `field`, `recipient` |

Every path is absolute. A checkout's `branch` is the branch checked out there, or `null` for a
detached head. A branch's `repo` is the path of a checkout of the repository the branch lives in,
and a branch without one belongs to the workspace's repository, so a file with no workspace gives
every branch a `repo`. A pull request's `repo` is the `owner/name` slug, its `branch` is the head
branch, and its optional `url` names the forge host, which is GitHub without one.

A reply channel names a tool, the field of the tool's input that holds the recipient, and the
recipient, such as the agent that spawned the session. A call to that tool whose field holds exactly
that recipient is a message the session sends through its own channel.

This made-up file gives a session a notes directory, its workspace, a pull request, and a channel
back to the agent named `planner`:

```json
{
  "format": "auto-mode.scope",
  "version": 1,
  "paths": ["/srv/agent-notes/session-7f3a"],
  "workspace": { "path": "/home/dev/shop/.worktrees/cart-totals", "branch": "cart-totals" },
  "worktrees": [{ "path": "/home/dev/shop-docs/.worktrees/cart-totals", "branch": "cart-totals" }],
  "branches": [{ "name": "cart-totals-followup" }],
  "pullRequests": [{ "repo": "example-org/shop", "number": 41, "branch": "cart-totals" }],
  "replyChannels": [{ "tool": "SendMessage", "field": "to", "recipient": "planner" }]
}
```

## What auto-mode does with it

- **Owned paths** are in the task scope, so the containment check passes a write below one, and Jev
  judges the write as it judges any in-scope call.
- **Checkouts, branches and pull requests** join the task scope under the same rules as the other
  scope sources: a branch counts only in its own repository, and no file can hand a session the
  default branch or a protected branch.
- **A reply-channel message** is allowed without asking Jev once a secret scan of the call's input
  finds nothing ([the reply channel](../architecture/stages/reply-channel.md)). A message to any
  other recipient, or through any other tool, is judged as outbound like every other message.

A reply channel grants no consent. It takes one message out of what Jev judges, and nothing a rule
asks the user to name.

auto-mode reads the file and never writes it. A missing file, or no `AUTO_MODE_SCOPE_FILE`, adds
nothing. A file that is not JSON, holds another version, or holds a field the format does not define
adds nothing either, and auto-mode prints one line to stderr. The line names the field it refused
when it can, such as `replyChannels.0.recipient` or a misspelt key, and otherwise names only the
file.

## Writing the file from a launcher

1. Write the file where the session's agent cannot write: outside every path and checkout the file
   declares, and outside the scratch space every task owns, such as `/tmp`. An agent that can edit
   its scope file can grant itself any scope.
2. Write the file whole, to a temporary name beside it, and rename it into place, so auto-mode never
   reads half a file.
3. Start Claude Code with `AUTO_MODE_SCOPE_FILE` set to the file's absolute path.
4. Rewrite the file the same way when the session's scope changes. auto-mode reads it again on the
   next call it judges.
5. Remove the file when the session ends.

The `launcher` scope source reads the file, and the shipped configuration runs it. A configuration
whose `scopeSources` block leaves out `launcher` ignores the file
([scope sources](./configuration.md#scope-sources)).
