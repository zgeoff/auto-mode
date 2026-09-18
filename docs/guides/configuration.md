# Configuration

auto-mode reads `~/.config/auto-mode/config.json`, or
`$XDG_CONFIG_HOME/auto-mode/config.json` when that is set. The file is optional
and every field has a default.

A missing file is normal. A malformed one throws, rather than running a policy you
did not write.

## The smallest useful file

```json
{
  "preset": "spark",
  "provider": { "apiKeyEnv": "META_API_KEY" }
}
```

## Fields

| Field | Default | Meaning |
|---|---|---|
| `preset` | `spark` | Which provider to start from |
| `provider.*` | from the preset | Override any single field |
| `classifierPath` | the shipped file | Your own judgement framework |
| `rulesPath` | the shipped file | Your own rule list |
| `transcriptEntries` | `40` | How much history the model sees |
| `onFailure` | `defer` | `defer` writes nothing; `deny` fails closed |

A `provider` block overrides fields on the preset rather than replacing it, so
you can change one thing:

```json
{ "preset": "glm", "provider": { "timeoutMs": 45000 } }
```

Naming a preset that does not exist is an error, and the message lists the ones
that do.

## Presets

| Preset | Model | Base URL | Key variable |
|---|---|---|---|
| `spark` | `muse-spark-1.3-contributor` | `https://api.meta.ai` | `META_API_KEY` |
| `claude` | `claude-haiku-4-5-20251001` | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` |
| `glm` | `glm-5.3-flash` | `https://api.z.ai/api/anthropic` | `ZAI_API_KEY` |

Every provider speaks the Anthropic Messages API, so one client covers all of them
and any other gateway that does. Point `provider.baseURL` and `provider.model` at
anything compatible.

### Why Spark is the default

It reasons, it was correct on every case measured, and a contributor-tier call
costs roughly a fortieth of the alternatives.

Reasoning is what does the work here. With thinking disabled, a fast model blocked
`rm -rf node_modules` — a command that looks destructive and is routine. With
thinking on it was correct, and its latency then matched Spark's.

## Provider fields

| Field | Meaning |
|---|---|
| `baseURL` | The API root. `/v1/messages` is appended. |
| `model` | Model id |
| `apiKeyEnv` | Environment variable holding the key. Tried first. |
| `apiKeyCommand` | Shell command that prints the key. Tried when the variable is unset. |
| `reasoning` | Whether the model thinks before answering |
| `maxTokens` | Output budget |
| `timeoutMs` | How long to wait |

The last three move together. A reasoning model needs a different prompt ending,
more tokens, and more time, so `reasoning` sets all three.

`maxTokens` is a floor. Spark spends 1,000 to 1,900 tokens thinking before it
answers, and a budget that cuts in before it finishes returns an empty response
rather than a worse one. The shipped default is 3,000.

## Finding the key

The environment variable is tried first, then the command.

```json
{
  "preset": "spark",
  "provider": { "apiKeyCommand": "op read op://vault/meta/credential" }
}
```

Under Muse the command is the only option, because Muse runs hook commands with a
scrubbed environment and no exported variable reaches them.

A command that fails, times out after five seconds, or prints nothing is treated
as no key, which follows `onFailure`.

## Replacing the policy

```json
{
  "rulesPath": "/home/you/my-rules.md",
  "classifierPath": "/home/you/my-classifier.md"
}
```

Each replaces the shipped file whole; the two are not merged. `rulesPath` is the
one most setups change.

A replacement rule list must keep the three headings `HARD BLOCK rules`,
`SOFT BLOCK rules`, and `ALLOW exceptions`, because the classifier refers to them
by name. A replacement framework must keep a `<rules>` line; without it auto-mode
throws rather than send a policy containing no rules.

To adjust rather than replace, copy the shipped file and edit it. See
[Writing a policy](./policy.md).
