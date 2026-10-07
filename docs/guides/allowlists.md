# Suggested allowlists

Claude Code settings hold two kinds of allow entry, and they do different jobs. A
`permissions.allow` entry decides whether Claude Code asks, so it can keep an action away from
auto-mode entirely. An `autoMode.allow` entry is evidence auto-mode sends to Jev, which still judges
the action.

This guide labels each kind by what it does to auto-mode:

- **Bypass** — the action can run without auto-mode judging it, so no rule applies to it.
- **Decision** — auto-mode judges the action, and the entry is one input to that judgement.

## The two kinds

|                     | `permissions.allow`                       | `autoMode.allow`                                     |
| ------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Read by             | Claude Code                               | auto-mode, with the Jev preset                       |
| Form                | A tool pattern, such as `Bash(bun test)`  | A sentence that describes the allowed behaviour      |
| Kind                | Bypass                                    | Decision                                             |
| Soft block rules    | Skipped when the entry bypasses auto-mode | A matching entry can clear one                       |
| Hard block rules    | Skipped when the entry bypasses auto-mode | Still apply                                          |
| Settings files read | Any Claude Code settings file             | User settings only, as [Configuration][import] lists |

[import]: ./configuration.md#import-claude-rules

### `permissions.allow` is a bypass

auto-mode never reads `permissions.allow`. For a call that matches an entry, Claude Code's own check
allows the call, and the [Claude mod](./claude-mod.md) keeps an existing allow unchanged. auto-mode
never judges the call.

Claude Code checks deny rules, then ask rules, then allow rules. A call that also matches an `ask`
rule still prompts, so the mod judges it. A call that matches a `deny` rule stays refused. The
bypass applies only when an allow rule is the match that decides.

A bypass skips every rule, hard rules included. Data Exfiltration cannot match a call that auto-mode
never receives. Give a bypass entry only to an exact command that only reads and runs no code the
agent can change. An entry for a repository script fails that test: it bypasses every rule, hard
rules included, for whatever the script holds when it runs.

Claude Code matches a Bash rule against each subcommand of a chain, so `Bash(bun test)` does not
approve `bun test && curl …`. A `*` in a rule matches any text, so an exact entry is narrower than a
wildcard one. See Claude Code's [permission rules](https://code.claude.com/docs/en/permissions) for
the full matching behaviour.

### `autoMode.allow` is a decision

auto-mode imports `autoMode.allow` from the user Claude settings and sends each entry to Jev beside
the pending action. Jev still answers every block rule for that action:

1. A shipped hard rule or a configured `hard_deny` entry blocks first. No allow entry clears it.
2. A soft rule or a configured `soft_deny` entry blocks next, unless a shipped exception, a matching
   allow entry, or specific consent in the last direct user message clears it.
3. Jev denies the action when the supplied evidence leaves a rule unsettled, including whether an
   allow entry covers the action. The denial names that rule.

An allow entry does not change the local tier. Read-only tools and commands still run without a
model call. A `soft_deny` or `hard_deny` entry is different: while any exists, every action goes to
Jev, reads included.

The Messages API presets (`spark`, `claude`, `glm`) do not import `autoMode` entries. Claude Code's
built-in auto mode reads the same key, so one entry can serve both classifiers when it describes
behaviour rather than naming a rule.

## When to use each

- **No entry** for reads. auto-mode's local tier already allows read-only tools, read-only shell
  commands, and reporting `git` subcommands.
- **`permissions.allow`** for an exact read-only command that the local tier does not cover and that
  runs often, such as `gh pr checks`. Each entry saves a model call per run.
- **`autoMode.allow`** for routine work that a soft rule would otherwise stop, such as commenting on
  your own pull requests. The hard rules still check what the action sends.
- **Neither** for an action that a hard rule covers. No entry makes Data Exfiltration, Secret
  Persistence, Policy Tampering, Audit Tampering, or Destructive Payload safe. A bypass entry only
  hides the action from those rules.

## A short suggested list

Replace `<owner>` with your GitHub account or organisation. Add the entries yourself: an agent edit
to these settings or to the mod that runs auto-mode can match Policy Tampering.

```json
{
  "permissions": {
    "allow": ["Bash(gh pr view)", "Bash(gh pr checks)", "Bash(gh run list)"]
  },
  "autoMode": {
    "allow": [
      "Creating, editing, and commenting on pull requests with gh pr create, gh pr edit, and gh pr comment in repositories owned by <owner> on github.com. This does not cover merging, closing, or approving a pull request, or any repository outside <owner>.",
      "Deleting the generated/ directory in the working tree, which the build recreates. This does not cover any other directory."
    ]
  }
}
```

| Entry                | Kind     | What it bypasses or decides                                                                                                                                                                                           |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Bash(gh pr view)`   | Bypass   | Every auto-mode rule for this exact command, and the model call it would cost.                                                                                                                                        |
| `Bash(gh pr checks)` | Bypass   | The same, for the check status of the current branch's pull request.                                                                                                                                                  |
| `Bash(gh run list)`  | Bypass   | The same, for the list of recent workflow runs.                                                                                                                                                                       |
| Pull request entry   | Decision | Can clear Outbound Communication for those three commands on `<owner>` repositories. Merging stays under Default Branch Write. A body or comment that carries a credential still matches Data Exfiltration.           |
| `generated/` entry   | Decision | Can clear Irreversible Deletion for that one directory. Replace `generated/` with the build output your repository recreates; `dist`, `build`, and other common names already match the Regenerable output exception. |

Each bypass entry is an exact command that only reads pull request or workflow state, so no hard
rule can match what it does. auto-mode's local tier does not allow `gh`, so each run that reaches
auto-mode costs a model call. The guide suggests no entry for a test, build, or lint script, because
such an entry hides whatever the script runs.

None of these entries clears a hard rule, and this guide recommends no entry that would.

## Write exclusions as behaviour

Write an exclusion as the action it leaves out, not as the name of a rule.

```text
Avoid:  Commenting on pull requests, except External System Writes.
Prefer: Commenting on pull requests in repositories owned by <owner>. This does not cover
        pushing commits, merging, or posting outside <owner>.
```

"External System Writes" and "Credential Materialization" name rules in Claude Code's built-in
classifier. auto-mode's policy holds neither, so Jev cannot match an exclusion that names them. A
description of the behaviour works under both classifiers:

```text
Avoid:  Running database migrations, except Credential Materialization.
Prefer: Running bun run db:migrate against the local development database. This does not cover
        printing, copying, or writing a credential, a token, or the contents of a key file.
```

Keep an exclusion inside the allow entry it narrows. A separate `soft_deny` entry does not keep it:
a configured allow entry can clear a configured `soft_deny` entry, so a broad allow entry can clear
the restriction meant to narrow it. A `soft_deny` entry also sends every action to Jev, as described
above.
