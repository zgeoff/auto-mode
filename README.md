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

**auto-mode** gives unattended running back to coding agents that are not Claude.

Claude Code has an auto mode that judges each action and only stops the dangerous
ones. Point Claude Code at a different model — GLM, Kimi, Muse Spark, anything
behind an Anthropic-compatible gateway — and you lose it. The harness is the
same, the tools are the same, but every `rm`, every `git push`, every write comes
back to you for approval. So the cheap model you switched to costs you a keypress
per step.

auto-mode is that judge, as a hook. It reads the action the agent is about to
take, decides, and answers in the shape the harness already understands. It works
in Claude Code, Codex, and Muse Code, and it does not care which model is driving
them.

## Install

```sh
npm i -g auto-mode
auto-mode init claude   # or codex, or muse
```

`init` prints the hook entry and the file to paste it into, plus the one thing
that harness needs beyond the entry. It does not write the file. Your settings
are yours, and an agent that can install its own restraints can remove them.

You also need a key for the judging model. The default is Muse Spark:

```sh
mkdir -p ~/.config/auto-mode
cat > ~/.config/auto-mode/config.json <<'JSON'
{ "preset": "spark", "provider": { "apiKeyEnv": "META_API_KEY" } }
JSON
```

Presets for `claude` and `glm` ship too. See
[Configuration](./docs/guides/configuration.md).

## How it decides

Two tiers, because the second one costs seconds.

1. **Local rules.** Deterministic matching, no network call, well under a
   millisecond. It answers **allow** or **escalate**, never deny. This is what
   makes the tool usable: reads, listings, `git status`, and deleting build
   output never reach the model.
2. **The model.** Everything else goes to a small reasoning model with the
   policy as its system prompt. A hard case takes 13 to 24 seconds.

A wrong local allow costs one unwatched action. A wrong local deny stops work you
asked for. That asymmetry is why tier one never denies.

## The policy is prose, and it is the product

Two files, and everything in them is what the model reads. Nothing in them is
addressed to you.

| File | Holds | Edit it to |
|---|---|---|
| [`policy/rules.md`](./policy/rules.md) | 22 rules, 7 exceptions | Change what is blocked |
| [`policy/classifier.md`](./policy/classifier.md) | Threat model, consent bar, evaluation rules, output contract | Change how judgement works |

`classifier.md` carries a `<rules>` marker on its own line. At run time auto-mode
replaces it with the whole of `rules.md`. `auto-mode print-prompt` writes exactly
what the model receives — no assembly you cannot see.

Rules split two ways. A **hard block** takes no consent, because it creates a risk
you cannot see from inside the session. A **soft block** clears when you named the
action *and* the detail that makes it dangerous — "force push this branch", not
"tidy up the repo". Seven exceptions carve out the work that looks dangerous and
is not: deleting `node_modules`, running a formatter, dropping a local test
database.

**Read [`policy/rules.md`](./policy/rules.md) before you turn this on.** If you
disagree with a rule, change the rule. Point `rulesPath` at your own file and it
replaces the shipped one whole.

## Harnesses

All three were verified end to end: the hook denied a real tool call and the
harness stopped it.

| Harness | Match every tool | Also needed |
|---|---|---|
| Claude Code | `"matcher": ".*"` | — |
| Codex | omit `matcher` | `hooks = true`, and trust the hook once |
| Muse Code | `"matcher": ""` | no `timeout_ms` key |

Each difference silently stops the hook running if you get it wrong, which is why
`init` prints them. Details in
[Harnesses](./docs/guides/harnesses.md).

## Writing nothing is an answer

It means auto-mode has no opinion, and the harness then does what it would have
done alone. That is the output for an unknown harness, an event that is not a tool
gate, malformed input, a missing key, and a model that times out.

So this can only narrow what your harness already allows. It never removes a gate
that was there. Set `onFailure` to `deny` if you would rather fail closed.

## Commands

| Command | What it does |
|---|---|
| `auto-mode run` | Read a payload on stdin, write a verdict on stdout |
| `auto-mode run --explain` | Also write the reasoning to stderr |
| `auto-mode run --local-only` | Skip the model tier |
| `auto-mode print-prompt` | Print the assembled system prompt |
| `auto-mode init <harness>` | Print the hook entry to add |

## Documentation

- [Overview](./docs/architecture/overview.md) — the two tiers, harness detection,
  the verdict contract, prompt caching, and every way this fails.
- [Configuration](./docs/guides/configuration.md) — every field, every preset, and
  how the key is found.
- [Harnesses](./docs/guides/harnesses.md) — installing into Claude Code, Codex,
  and Muse Code, and what each one does differently.
- [Writing a policy](./docs/guides/policy.md) — the rule tiers, the consent bar,
  and how to change or replace the shipped rules.

## Licence

MIT.
