# auto-mode documentation

auto-mode is a permission classifier that runs as a hook, so a coding agent that
is not Claude can run unattended. The [root README](../README.md) covers install
and everyday use.

## Architecture

- [Overview](./architecture/overview.md) — the two tiers, how a harness is
  identified, the verdict contract, prompt caching, and every way this fails.

## Guides

- [Configuration](./guides/configuration.md) — every `config.json` field, the
  three presets, and how the API key is found.
- [Harnesses](./guides/harnesses.md) — installing into Claude Code, Codex, and
  Muse Code, and the one thing each does differently.
- [Writing a policy](./guides/policy.md) — the rule tiers, the consent bar, and
  how to change or replace the shipped rules.

## The policy itself

- [`policy/rules.md`](../policy/rules.md) — what is blocked.
- [`policy/classifier.md`](../policy/classifier.md) — how judgement works.

Both are sent to the model verbatim. `auto-mode print-prompt` writes the two
spliced together, which is exactly what the classifier reads.
