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
    "judge": "claude-code",
    "blockThreshold": 0.2,
    "onFailure": "defer",
    "denialBudget": { "consecutive": 3, "perSession": 20 }
  },
  "policy": {
    "rulesPath": null,
    "frameworkPath": null
  },
  "capture": { "enabled": false }
}
```

The file has five blocks. `classifiers` and `scopeSources` are registries keyed by an id you choose.
`decision` assigns roles by pointing at registry ids. `policy` selects the prompt files and the
Claude settings to import. `capture` turns the request capture on. Every block is optional; an empty
file `{}` runs Jev with the shipped policy, reviews each Jev deny with the `claude-code` judge, and
captures nothing.

## Classifiers

Each entry describes one model endpoint. `kind` selects the defaults the entry starts from, and an
entry without `kind` uses its own id as the kind. So `"jev": {}` is the shipped Jev endpoint, and
`"fast": { "kind": "jev", "timeoutMs": 3000 }` is a second Jev entry with a shorter deadline.

| Kind          | Protocol      | Model                        | Key variable        |
| ------------- | ------------- | ---------------------------- | ------------------- |
| `jev`         | Jev decisions | `jev-1.13.0`                 | `TYPESAFE_API_KEY`  |
| `claude-code` | `claude -p`   | `claude-haiku-5-5`           | none; judge only    |
| `spark`       | Messages API  | `muse-spark-1.3-contributor` | `META_API_KEY`      |
| `claude`      | Messages API  | `claude-haiku-4-5-20251001`  | `ANTHROPIC_API_KEY` |
| `glm`         | Messages API  | `glm-5.3-flash`              | `ZAI_API_KEY`       |
| `messages`    | Messages API  | none; the entry must name it | none                |

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
and they do not import Claude's `autoMode` entries. The mod passes `--jev-only`, so as classifiers
these kinds serve library callers and `auto-mode run` without that flag; as the judge they serve the
mod too.

The `claude-code` kind can only judge. It runs `claude -p` with no tools, settings, MCP servers or
session file, through the local `claude` login, so it needs no API key. It drops every `ANTHROPIC_*`
variable and the Bedrock, Vertex and Foundry switches from the child's environment, so a session
pointed at another provider still reaches Claude. It waits up to 120 seconds. A machine without a
`claude` login fails the judge call, and the deny keeps its fixed reason.

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

| Field            | Default       | Effect                                                            |
| ---------------- | ------------- | ----------------------------------------------------------------- |
| `classifier`     | `jev`         | The classifiers id that judges each escalated action              |
| `judge`          | `claude-code` | The classifiers id that reviews each Jev deny; `null` for none    |
| `blockThreshold` | `0.2`         | Deny when some rule's block probability reaches this value        |
| `onFailure`      | `defer`       | Keep the manual approval, or deny, when the classifier fails      |
| `denialBudget`   | 3, 20         | Denials allowed in a row and per session before the user is asked |

A role names a registry id. When the registry has no entry by that id and the id is a built-in kind,
the role uses that kind's defaults, so `"classifier": "glm"` works without a `glm` entry. A role
that names a dropped entry, or an id that is neither an entry nor a kind, makes the file invalid.
The classifier cannot be a `claude-code` kind, and the judge cannot be a Jev kind, because Jev
writes no text.

### Judge

The judge reviews each deny Jev makes, with the prompt in `policy/judge.md` and the rules spliced
in. It reads the denied rule, the action, the last direct user message and the repository facts, and
answers confirm or overturn with a short reason.

- A confirm keeps the deny, and the agent reads `The reviewer confirmed the <rule> deny:` followed
  by the judge's reason, cut to 600 characters, then the instruction every deny ends with.
- An overturn of a soft rule allows the action. The judge overturns when the last direct user
  message asks for this operation on this target, or when the facts show the rule's harm cannot
  happen.
- A hard rule and a configured hard deny entry never clear. The judge writes their reason only, and
  an overturn of one keeps the deny with its fixed reason.
- A missing key, a timeout, a failed call or an unreadable reply keeps the deny with its fixed
  reason. The judge never turns a failure into an allow, whatever `onFailure` says.

A containment deny, a retry of the action just denied, and a deny from a Messages API classifier
never reach the judge. The judge's deadline is its entry's `timeoutMs`, bounded by the time the mod
leaves the CLI.

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

## Capture

The capture records real traffic for an evaluation corpus. It is off unless the file turns it on:

```json
{ "capture": { "enabled": true } }
```

| Field     | Default                               | Effect                                    |
| --------- | ------------------------------------- | ----------------------------------------- |
| `enabled` | `false`                               | Append each judged request to the capture |
| `dir`     | `$XDG_STATE_HOME/auto-mode/captures/` | Absolute directory for the capture files  |

With capture on, `auto-mode run` appends one line per judged action to `requests-<date>.jsonl`, one
file per UTC day: the mod request as the CLI received it, the verdict or `null` when it wrote none,
the deciding stage, and whether the denial budget left the action to the user. The default directory
falls back to `~/.local/state/auto-mode/captures/` when the variable is absent, and a leading `~/`
in `dir` expands to the home directory. The CLI narrows the directory to mode `0700` and each file
to `0600`, and refuses to write through a link at the file's path.

A capture holds whole prompts, commands and paths, so it never goes into git. The CLI resolves the
directory through any link and refuses one inside a git work tree: it writes nothing and prints
`auto-mode: capture skipped:` with the reason to stderr. A bare repository whose work tree is the
home directory, such as a dotfiles repository, leaves no `.git` on that walk, so the CLI also keeps
a `.gitignore` holding `*` in the directory; git honours it in any work tree, so `git add -A` skips
the captures. `git add -f` still adds them, so never force-add under the capture directory. A
capture that cannot be written prints `auto-mode: capture unavailable`. Neither changes the verdict
or the exit code. A request the CLI does not judge, such as a body that is not a mod request, is not
captured.

To turn the capture off, set `enabled` to `false` or remove the block; the CLI then never touches
the directory. Delete the files you no longer need: the CLI never prunes them.
[Run an evaluation](../runbooks/run-an-evaluation.md#anonymise-a-capture-into-a-corpus) turns a
capture into a corpus.

## Parsing

Each block is strict: a key auto-mode does not know makes the file invalid, so a field in the wrong
place is reported instead of ignored. That includes the top-level keys of earlier releases, such as
`preset`, `provider` or `rulesPath`: the diagnostic names the key, and its value belongs in one of
the five blocks above. Registry entries are parsed one at a time. A bad entry is left out with one
diagnostic line naming it, and the other entries load:

```text
auto-mode: /home/you/.config/auto-mode/config.json: classifiers.typo dropped: unknown kind 'gpt'; known kinds are jev, spark, claude, glm, messages
```

`auto-mode run` and `auto-mode print-prompt` write these lines to stderr. The mod does not show
stderr, so run `auto-mode print-prompt > /dev/null` after you edit the file to see them.

## Inspect the prompt

Run `auto-mode print-prompt` to inspect the base policy for your configured classifier. The printed
policy excludes imported user settings and the proposed action.
