# auto-mode documentation

auto-mode is a permission classifier that runs as a hook. The [root README](../README.md) covers
install and everyday use.

## Architecture

- [Overview](./architecture/overview.md) — the two tiers, how a harness is identified, the verdict
  contract, permission evidence, and failure handling.

## Guides

- [Configuration](./guides/configuration.md) — every `config.json` field, the provider presets, and
  how the API key is found.
- [Harnesses](./guides/harnesses.md) — installing into Claude Code, Codex, and Muse Code, and the
  one thing each does differently.
- [Claude permission mod](./guides/claude-mod.md) — Jev decisions before the dialog, time limits,
  and a reversible session trial.
- [Suggested allowlists](./guides/allowlists.md) — `permissions.allow` against `autoMode.allow`,
  which entries bypass auto-mode, and how to write exclusions.
- [Writing a policy](./guides/policy.md) — the rule tiers, the consent bar, and how to change or
  replace the shipped rules.

## The policy itself

- [`policy/rules.md`](../policy/rules.md) — what is blocked.
- [`policy/decision.md`](../policy/decision.md) — Jev evidence and precedence.
- [`policy/classifier.md`](../policy/classifier.md) — the generative framework.

The selected framework combines with the rule list. `auto-mode print-prompt` prints that base
policy. The Jev request includes explicit Claude rules and action evidence separately.
