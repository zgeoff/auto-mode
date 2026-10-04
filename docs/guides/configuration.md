# Configuration

auto-mode reads `~/.config/auto-mode/config.json`, or `$XDG_CONFIG_HOME/auto-mode/config.json` when
that variable is set. A missing file uses the shipped defaults. An unreadable or malformed file
leaves the hook without a verdict and writes a diagnostic.

## Configure Jev

```json
{
  "preset": "jev",
  "provider": { "apiKeyEnv": "TYPESAFE_API_KEY" }
}
```

The default Jev provider calls TypeSafe's `/v1/systemone` endpoint with a Bearer key. It pins
`jev-1.13.0` and waits up to 5 seconds. Set `provider.baseURL` to the API root of a compatible
provider.

| Field                | Default                      | Effect                                                        |
| -------------------- | ---------------------------- | ------------------------------------------------------------- |
| `preset`             | `jev`                        | Select the provider                                           |
| `provider.*`         | Preset values                | Override individual provider settings                         |
| `classifierPath`     | Provider's shipped framework | Replace the decision framework                                |
| `rulesPath`          | Shipped rules                | Replace the block rules and exceptions                        |
| `claudeSettingsPath` | User Claude settings         | Import explicit `autoMode` entries                            |
| `minConfidence`      | `0.8`                        | Require confidence and selected probability at this threshold |
| `onFailure`          | `defer`                      | Defer to the harness or deny on classifier failure            |
| `transcriptEntries`  | `40`                         | Limit history for Messages API presets                        |

`minConfidence` accepts values from `0.5` to `1`. The default is a starting threshold, not a
measured accuracy guarantee. An uncertain Jev decision needs manual approval regardless of
`onFailure`; uncertainty is a valid result, not a service failure.

## Import Claude rules

The default source is `~/.claude/settings.json`. `CLAUDE_CONFIG_DIR` selects another Claude
directory when present. An explicit `claudeSettingsPath` selects one file; `null` disables the
import. auto-mode never reads a repository's Claude settings for standing classifier permissions.

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

## Provider settings

| Field           | Effect                                                                |
| --------------- | --------------------------------------------------------------------- |
| `protocol`      | `system-one` for typed decisions; `messages` for generative providers |
| `baseURL`       | API root, without the endpoint                                        |
| `model`         | Provider model identifier                                             |
| `apiKeyEnv`     | Environment variable that holds the key                               |
| `apiKeyCommand` | Shell command that prints the key                                     |
| `timeoutMs`     | API deadline in milliseconds                                          |
| `reasoning`     | Prompt ending for Messages API providers                              |
| `maxTokens`     | Output budget for Messages API providers                              |

The key resolver tries the environment variable first, then the command. A command that fails,
prints no key, or exceeds 5 seconds produces a missing-key failure. Muse Code scrubs exported
variables from hooks, so use a key command there.

```json
{
  "preset": "jev",
  "provider": {
    "apiKeyCommand": "op read 'op://<vault>/<item>/credential'"
  }
}
```

A provider block without a preset or protocol retains the Messages API defaults. Select
`preset: "jev"` or `protocol: "system-one"` explicitly for a custom Jev provider.

Existing generative presets remain available:

| Preset   | Model                        | Key variable        |
| -------- | ---------------------------- | ------------------- |
| `spark`  | `muse-spark-1.3-contributor` | `META_API_KEY`      |
| `claude` | `claude-haiku-4-5-20251001`  | `ANTHROPIC_API_KEY` |
| `glm`    | `glm-5.3-flash`              | `ZAI_API_KEY`       |

These providers use `/v1/messages`, the generative framework, and up to `transcriptEntries` entries.
They do not import Claude's `autoMode` entries. Their reasoning and output budgets apply only to
that protocol.

## Replace the policy

```json
{
  "rulesPath": "/home/you/my-rules.md",
  "classifierPath": "/home/you/my-decision-framework.md"
}
```

Each file replaces its shipped counterpart. Keep the `HARD BLOCK rules`, `SOFT BLOCK rules`, and
`ALLOW exceptions` headings in the rule file, with each rule under a `###` heading. Keep the
`<rules>` marker in the framework. Duplicate or absent block rules prevent a Jev call.

Run `auto-mode print-prompt` to inspect the base policy for your configured provider. The printed
policy excludes imported user settings and the proposed action.
