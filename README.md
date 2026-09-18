# auto-mode

A permission classifier that runs as a hook. It reads the agent's next action and
answers allow, deny, or nothing at all — so you can leave an agent unattended
without approving every step.

Built for coding agents that are **not** Claude, in harnesses that are not Claude
Code. Claude Code has its own auto mode; this gives the same shape to everything
else.

## Install

```sh
npm i -g auto-mode
auto-mode init claude   # or codex, or muse
```

`init` prints the hook entry and the path to paste it into. It does not write
that file. Your settings are yours, and a tool that installs its own restraints
can remove them.

## The two tiers

1. **Local rules.** Deterministic matching, no network call, well under a
   millisecond. It answers **allow** or **escalate** and never denies — a wrong
   local allow costs one unwatched action, a wrong local deny stops work you
   asked for.
2. **The model.** Everything the first tier declines goes to a small reasoning
   model with the policy as its system prompt. Measured at 13-24 seconds on a
   hard case, which is why tier one has to catch the ordinary ones.

## The policy

Two files, and everything in them is what the model reads. Nothing there is
addressed to you.

| File | What it holds | Change it to |
|---|---|---|
| `policy/rules.md` | 22 rules, 7 exceptions | Change what is blocked |
| `policy/classifier.md` | Threat model, consent bar, evaluation rules, output contract | Change how judgement works |

`classifier.md` carries a `<rules>` marker on its own line. At run time auto-mode
replaces it with the whole of `policy/rules.md` and the two become one prompt.
`auto-mode print-prompt` writes exactly what the model receives.

**Read `policy/rules.md` before you turn this on.** If you disagree with a rule,
change the rule.

## Configuration

`~/.config/auto-mode/config.json`. Everything has a default; the file is
optional.

```json
{
  "preset": "spark",
  "provider": { "apiKeyCommand": "my-key-helper" },
  "onFailure": "defer"
}
```

Three presets: `spark` (the default), `claude`, `glm`. Each names a base URL, a
model, a key source, and the three settings that move together — whether the
model reasons, its token budget, and its timeout.

| Key | Default | Meaning |
|---|---|---|
| `preset` | `spark` | Which provider to start from |
| `provider.*` | from the preset | Override any single field |
| `classifierPath`, `rulesPath` | the shipped files | Use your own policy |
| `transcriptEntries` | `40` | How much history the model sees |
| `onFailure` | `defer` | `defer` writes nothing; `deny` fails closed |

**Muse Spark is the default** because it reasons, it was correct on every case
measured, and a contributor-tier call costs roughly a fortieth of the
alternatives. Its token budget is a floor, not a preference: below it, Spark
returns nothing at all.

The key comes from `provider.apiKeyEnv` first, then from `provider.apiKeyCommand`
if that is unset. Muse runs hooks with a scrubbed environment, so under Muse the
command is the only one that works.

## Writing nothing is an answer

It means auto-mode has no opinion, and the harness then does what it would have
done alone. That is the output for an unknown harness, an event that is not a
tool gate, malformed input, a missing key, and a model that times out. So this
can only turn an ask into an allow or a deny — it never removes a gate that was
already there.

Set `onFailure` to `deny` if you would rather fail closed.

## Harnesses

Claude Code, Codex, and Muse Code. The verdict contract is the same for all
three, and all three were verified end to end: the hook denied a real tool call
and each harness stopped it.

They differ in how the hook is registered, and each difference makes the hook
silently not run if you get it wrong. `auto-mode init` prints these.

| Harness | Match every tool | Also needed |
|---|---|---|
| Claude | `"matcher": ".*"` | — |
| Codex | omit `matcher` | `hooks = true`, and trust the hook once |
| Muse | `"matcher": ""` | no `timeout_ms` key |

Three traps worth naming:

- Claude matches tool names against a **regular expression**. `"*"` is not valid
  regex and `""` matches only a tool named empty; both leave the hook installed
  and never firing. Muse reads `""` as every tool, so the same value means
  opposite things in the two harnesses.
- Codex will not run an **untrusted** hook. It is skipped silently until you
  trust it once; the answer is recorded under `[hooks.state]` in `config.toml`.
- Muse **rejects a handler carrying `timeout_ms`**, reporting an unknown field
  and skipping the whole handler.

Detection order matters too. Muse is identified by `model_provider`, which the
others do not send. Claude sends `prompt_id`. Codex sends `turn_id` — and so
does Muse, so Muse has to be tested first.

## What this cannot do

- **A hook that cannot start fails open.** If the command is missing or crashes,
  the harness logs it and carries on. `onFailure: "deny"` cannot help, because
  the process never runs.
- **It can only narrow what the harness already allows.** A tool your own
  permission settings deny is refused before the hook sees it.
- **The agent's own judgement comes first.** A model that refuses to issue a
  command means the hook is never consulted for it.

## Commands

| Command | What it does |
|---|---|
| `auto-mode run` | Read a payload on stdin, write a verdict on stdout |
| `auto-mode run --explain` | Also write the reasoning to stderr |
| `auto-mode run --local-only` | Skip the model tier |
| `auto-mode print-prompt` | Print the assembled system prompt |
| `auto-mode init <harness>` | Print the hook entry to add |

## Licence

MIT.
