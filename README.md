<div align="center">
  <h1>auto-mode</h1>

  <p>
    <a href="https://www.npmjs.com/package/auto-mode"><img src="https://img.shields.io/npm/v/auto-mode" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="./docs/README.md">Documentation</a> •
    <a href="./docs/guides/configuration.md">Configuration</a> •
    <a href="./policy/rules.md">The rules</a> •
    <a href="./docs/architecture/overview.md">Architecture</a>
  </p>
</div>

**auto-mode** is a permission classifier that runs as a hook. It decides whether a coding agent's
next action should run.

Claude Code's built-in auto mode judges actions only for Claude. Point Claude Code at another model
through an Anthropic-compatible gateway — GLM, Kimi, Muse Spark — and that judging stops. Every
shell command, file write, and push needs your approval again.

auto-mode replaces it. The harness calls it before a tool runs, hands it the pending call, and reads
back allow, deny, or nothing. It works in Claude Code, Codex, and Muse Code, and behaves the same
whichever model drives them.

## Install

```sh
npm i -g auto-mode
auto-mode init claude   # or codex, or muse
```

`init` prints the hook entry, the file to paste it into, and the extra step that harness needs. It
does not write the file itself.

The judging model needs a key. The default model is Muse Spark:

```sh
mkdir -p ~/.config/auto-mode
cat > ~/.config/auto-mode/config.json <<'JSON'
{ "preset": "spark", "provider": { "apiKeyEnv": "META_API_KEY" } }
JSON
```

Presets for `claude` and `glm` ship too. See [Configuration](./docs/guides/configuration.md).

## How it decides

Two tiers.

1. **Local rules.** Deterministic matching, no network call, under a millisecond. Answers allow or
   escalate, never deny. Reads, listings, `git status`, and deleting build output are settled here
   and never reach the model.
2. **The model.** Everything else goes to a small reasoning model with the policy as its system
   prompt. A hard case takes 13 to 24 seconds.

Tier one never denies because the two errors cost differently. A wrong allow costs one unwatched
action. A wrong deny stops work you asked for, and the rules that deny are prose that needs a
reader.

## The policy

Two files. Both are sent to the model verbatim, and neither addresses you.

| File                                             | Holds                                                        | Edit it to                 |
| ------------------------------------------------ | ------------------------------------------------------------ | -------------------------- |
| [`policy/rules.md`](./policy/rules.md)           | 22 rules, 7 exceptions                                       | Change what is blocked     |
| [`policy/classifier.md`](./policy/classifier.md) | Threat model, consent bar, evaluation rules, output contract | Change how judgement works |

`classifier.md` carries a `<rules>` marker on its own line. At run time auto-mode replaces it with
the whole of `rules.md`. `auto-mode print-prompt` writes the result, which is what the model reads.

Rules come in two tiers. A **hard block** takes no consent, because it creates a risk you cannot see
from inside the session. A **soft block** clears when you named the action and the detail that makes
it dangerous — "force push this branch", not "tidy up the repo". Seven exceptions cover work that
resembles a blocked action and is not: deleting `node_modules`, running a formatter, dropping a
local test database.

Read [`policy/rules.md`](./policy/rules.md) before turning this on. To change a rule, edit it;
`rulesPath` points at your own file and replaces the shipped one whole.

## Harnesses

All three were verified end to end: the hook denied a real tool call and the harness stopped it.

| Harness     | Match every tool  | Also needed                             |
| ----------- | ----------------- | --------------------------------------- |
| Claude Code | `"matcher": ".*"` | —                                       |
| Codex       | omit `matcher`    | `hooks = true`, and trust the hook once |
| Muse Code   | `"matcher": ""`   | no `timeout_ms` key                     |

Each difference stops the hook running if you get it wrong, and none of them reports an error.
`init` prints the right one. Details in [Harnesses](./docs/guides/harnesses.md).

## Writing nothing is an answer

It means auto-mode has no opinion, and the harness does what it would have done alone. That is the
output for an unknown harness, an event that is not a tool gate, malformed input, a missing key, and
a model that times out.

auto-mode can therefore only narrow what your harness already allows. It never removes a gate that
was there. Set `onFailure` to `deny` to fail closed instead.

## Commands

| Command                      | What it does                                       |
| ---------------------------- | -------------------------------------------------- |
| `auto-mode run`              | Read a payload on stdin, write a verdict on stdout |
| `auto-mode run --explain`    | Also write the reasoning to stderr                 |
| `auto-mode run --local-only` | Skip the model tier                                |
| `auto-mode print-prompt`     | Print the assembled system prompt                  |
| `auto-mode init <harness>`   | Print the hook entry to add                        |

## Documentation

- [Overview](./docs/architecture/overview.md) — the two tiers, harness detection, the verdict
  contract, prompt caching, and the failure modes.
- [Configuration](./docs/guides/configuration.md) — every field, every preset, and how the key is
  found.
- [Harnesses](./docs/guides/harnesses.md) — installing into Claude Code, Codex, and Muse Code, and
  what each does differently.
- [Writing a policy](./docs/guides/policy.md) — the rule tiers, the consent bar, and how to change
  or replace the shipped rules.

## Licence

MIT.
