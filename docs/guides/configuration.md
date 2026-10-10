# Configuration

auto-mode reads `~/.config/auto-mode/config.json`, or `$XDG_CONFIG_HOME/auto-mode/config.json` when
that variable is set. A missing file uses the shipped defaults. An unreadable or malformed file
leaves the action without a verdict and writes a diagnostic.

## The shape

```json
{
  "classifiers": {
    "jev": { "apiKeyEnv": "TYPESAFE_API_KEY" },
    "haiku": {
      "kind": "messages",
      "model": "claude-haiku-4-5-20251001",
      "apiKeyEnv": "ANTHROPIC_API_KEY"
    }
  },
  "scopeSources": {
    "cwd": {},
    "scratch": { "kind": "globs", "paths": ["~/scratch/**"] }
  },
  "decision": {
    "classifier": "jev",
    "judge": null,
    "blockThreshold": 0.2,
    "onFailure": "defer",
    "denialBudget": { "consecutive": 3, "perSession": 20 }
  },
  "policy": {
    "rulesPath": null,
    "frameworkPath": null
  }
}
```

The file has four blocks. `classifiers` and `scopeSources` are registries keyed by an id you choose.
`decision` assigns roles by pointing at registry ids. `policy` selects the prompt files and the
Claude settings to import. Every block is optional; an empty file `{}` runs Jev with the shipped
policy.

## Classifiers

Each entry describes one model endpoint. `kind` selects the defaults the entry starts from, and an
entry without `kind` uses its own id as the kind. So `"jev": {}` is the shipped Jev endpoint, and
`"fast": { "kind": "jev", "timeoutMs": 3000 }` is a second Jev entry with a shorter deadline.

| Kind       | Protocol      | Model                        | Key variable        |
| ---------- | ------------- | ---------------------------- | ------------------- |
| `jev`      | Jev decisions | `jev-1.13.0`                 | `TYPESAFE_API_KEY`  |
| `spark`    | Messages API  | `muse-spark-1.3-contributor` | `META_API_KEY`      |
| `claude`   | Messages API  | `claude-haiku-4-5-20251001`  | `ANTHROPIC_API_KEY` |
| `glm`      | Messages API  | `glm-5.3-flash`              | `ZAI_API_KEY`       |
| `messages` | Messages API  | none; the entry must name it | none                |

The `messages` kind starts from `https://api.anthropic.com`, reasoning on, 3,000 output tokens and a
45-second deadline. Every field below overrides the kind's default:

| Field           | Effect                                          |
| --------------- | ----------------------------------------------- |
| `kind`          | The defaults to start from; the id when omitted |
| `baseURL`       | API root, without the endpoint                  |
| `model`         | Provider model identifier                       |
| `apiKeyEnv`     | Environment variable that holds the key         |
| `apiKeyCommand` | Shell command that prints the key               |
| `timeoutMs`     | API deadline in milliseconds                    |
| `reasoning`     | Prompt ending for Messages API providers        |
| `maxTokens`     | Output budget for Messages API providers        |

The Jev kind calls TypeSafe's `/v1/systemone` endpoint with a Bearer key and waits up to 5 seconds.
Set `baseURL` to the API root of a compatible provider. The Messages API kinds use `/v1/messages`
and the generative framework. Their history is the last direct user message that the mod captured,
and they do not import Claude's `autoMode` entries. The mod passes `--jev-only`, so these kinds
serve library callers and `auto-mode run` without that flag.

### Credentials

An entry names its key by reference only. The resolver tries `apiKeyEnv` first, then
`apiKeyCommand`. A command that fails, prints no key, or exceeds 5 seconds produces a missing-key
failure. Use a key command when the Claude Code process does not carry the key variable:

```json
{
  "classifiers": {
    "jev": { "apiKeyCommand": "op read 'op://<vault>/<item>/credential'" }
  }
}
```

An entry that holds a literal `apiKey`, `key`, `token` or `secret` field is dropped, and the
diagnostic names the field but never its value.

## Scope sources

Each entry names one source of the task scope: the worktrees, branches, pull requests and paths the
task owns. As with classifiers, `kind` defaults to the id. The task scope is the union of every
entry's answer, and the containment check denies a write outside it.

| Kind      | Fields                    | Source                                         |
| --------- | ------------------------- | ---------------------------------------------- |
| `cwd`     | none                      | The worktree that holds the action's directory |
| `session` | none                      | What the session itself created                |
| `globs`   | `paths`, a non-empty list | Path globs that every task owns                |
| `atc`     | none                      | What atc's session record declares             |

A file without `scopeSources` runs `cwd`, `session` and `atc`. A file with the block runs exactly
its entries, and warns when none of them is `cwd`, because the task then owns only what the other
sources name.

- `cwd` owns the worktree that holds the action's directory, and its branch unless that is the
  default branch.
- `session` owns the worktrees and branches the session created and the pull requests it opened
  whose head branch is in scope. The mod reports each Bash call that can create one, and auto-mode
  keeps what the call made in `$XDG_STATE_HOME/auto-mode/session-scope/`, one file per session ID,
  so the scope survives a reload of the mod and a `--resume` of the session. A subagent's worktree
  belongs to its session.
- `globs` owns every path that matches one of `paths`; a leading `~/` is the home directory. A glob
  that covers every worktree, such as `.worktrees/**`, defeats the containment check, and the file
  warns about any glob that names `.worktrees`.
- `atc` owns what atc's session record declares: the workspace atc prepared and the extra worktrees
  as worktrees; their branches and the declared branches when they sit in the action's repository;
  and the declared pull requests whose head branch is in scope. It reads version 1 of the
  `atc.session-record` format at `$ATC_SESSION_RECORD` and never writes it. Without the variable or
  the file the source contributes nothing; a record that does not parse, holds another version, or
  does not name the session in `$ATC_SESSION_ID` contributes nothing and prints one line to stderr.
  atc owns the format, and only a caller outside the session can extend the record.

No source can hand a task the default branch, or `main`, `master`, `trunk` or `develop` when the
default branch is unknown. `/tmp` is scratch space that every task owns.

## Decision

| Field            | Default | Effect                                                            |
| ---------------- | ------- | ----------------------------------------------------------------- |
| `classifier`     | `jev`   | The classifiers id that judges each escalated action              |
| `judge`          | `null`  | The classifiers id that reviews each deny; `null` for none        |
| `blockThreshold` | `0.2`   | Deny when some rule's block probability reaches this value        |
| `onFailure`      | `defer` | Keep the manual approval, or deny, when the classifier fails      |
| `denialBudget`   | 3, 20   | Denials allowed in a row and per session before the user is asked |

A role names a registry id. When the registry has no entry by that id and the id is a built-in kind,
the role uses that kind's defaults, so `"classifier": "glm"` works without a `glm` entry. A role
that names a dropped entry, or an id that is neither an entry nor a kind, makes the file invalid.

### Denial budget

`denialBudget` takes `consecutive` and `perSession`, each a positive whole number, defaulting to 3
and 20. A deny is the normal outcome of a refused action: the agent reads the reason and continues
on another path. The budget is the only way the user is asked. Each deny states how many denials
remain, and the last one tells the agent to stop and report what consent it needs. The action that
would exceed either limit gets no verdict, so Claude Code shows its normal permission prompt, and
both counts start again from zero. An allow resets the consecutive count. A retry of the action just
denied is denied again without a classifier call and counts as a denial. A retry is the same tool,
directory and input; a new Bash `description` or `timeout` does not make it new, while a new direct
user message does, so new consent reaches the classifier.

The counts live in `$XDG_STATE_HOME/auto-mode/denials/`, one file per session and subagent, so they
survive a reload of the mod and a `--resume` of the session. Two tool calls checked at the same
moment in one session can each read the same count, so the count can fall one short.

```json
{ "decision": { "denialBudget": { "consecutive": 5, "perSession": 40 } } }
```

`blockThreshold` accepts a value above `0` and up to `1`. Jev answers each rule with a block
probability, and auto-mode allows unless one of them reaches the threshold. A lower value stops more
actions; a higher one lets more through. The default of 0.2 comes from a replay of recorded and
synthetic actions, not from a measured accuracy guarantee. A deny at the threshold is a valid
result, not a service failure, so `onFailure` does not apply to it. The old `minConfidence` key is
not accepted.

## Policy

| Field                | Default              | Effect                             |
| -------------------- | -------------------- | ---------------------------------- |
| `rulesPath`          | Shipped rules        | Replace the block rules            |
| `frameworkPath`      | Shipped framework    | Replace the decision framework     |
| `claudeSettingsPath` | User Claude settings | Import explicit `autoMode` entries |

`null` on `rulesPath` or `frameworkPath` selects the shipped file. `null` on `claudeSettingsPath`
disables the import. A leading `~/` in a path expands to the home directory.
[Writing a policy](./policy.md) covers replacing the rule and framework files.

### Import Claude rules

The default source is `~/.claude/settings.json`. `CLAUDE_CONFIG_DIR` selects another Claude
directory when present. An explicit `claudeSettingsPath` selects one file. auto-mode never reads a
repository's Claude settings for standing classifier permissions.

Only the `autoMode` arrays `environment`, `allow`, `soft_deny`, and `hard_deny` enter the request.
Credential fields, hooks, `permissions.allow`, and other settings do not. A missing user settings
file adds no explicit entries. An unreadable file or malformed `autoMode` block prevents
classification and follows `onFailure`.

The shipped policy remains the baseline in every section. `$defaults` refers to that policy and adds
no extra text. Omitting `$defaults` does not remove the baseline. Imported entries extend the
baseline even when Claude itself would replace a built-in list.

Environment entries describe targets, trust, and sensitivity. Configured allow entries clear
matching soft blocks. Configured hard denies and shipped hard blocks take priority. Put durable
exceptions in the configuration rather than an earlier conversational message.

## Parsing

Each block is strict: a key auto-mode does not know makes the file invalid, so a field in the wrong
place is reported instead of ignored. That includes the top-level keys of earlier releases, such as
`preset`, `provider` or `rulesPath`: the diagnostic names the key, and its value belongs in one of
the four blocks above. Registry entries are parsed one at a time. A bad entry is left out with one
diagnostic line naming it, and the other entries load:

```text
auto-mode: /home/you/.config/auto-mode/config.json: classifiers.typo dropped: unknown kind 'gpt'; known kinds are jev, spark, claude, glm, messages
```

`auto-mode run` and `auto-mode print-prompt` write these lines to stderr. The mod does not show
stderr, so run `auto-mode print-prompt > /dev/null` after you edit the file to see them.

## Inspect the prompt

Run `auto-mode print-prompt` to inspect the base policy for your configured classifier. The printed
policy excludes imported user settings and the proposed action.
