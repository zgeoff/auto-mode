# auto-mode documentation

auto-mode is a permission classifier: a core library and a Claude Code mod. The
[root README](../README.md) covers install and everyday use.

## Architecture

- [Overview](./architecture/overview.md) — the two tiers, the mod contract, permission evidence, and
  failure handling.
- [Decision model](./architecture/decision-model.md) — the approved design: the pipeline, deny with
  a reason, the denial budget, task scope, the edit bypass, Jev, the judge, and the evidence.
- [Evaluation](./architecture/evaluation.md) — the six measurements, the evaluation parts, case
  labels, and the reporting rules.

## Guides

- [Configuration](./guides/configuration.md) — every `config.json` field, the provider presets, and
  how the API key is found.
- [Claude permission mod](./guides/claude-mod.md) — the request and verdict, Jev decisions before
  the dialog, time limits, and a reversible session trial.
- [Suggested allowlists](./guides/allowlists.md) — `permissions.allow` against `autoMode.allow`,
  which entries bypass auto-mode, and how to write exclusions.
- [Writing a policy](./guides/policy.md) — the rule tiers, the consent bar, and how to change or
  replace the shipped rules.

## Runbooks

- [Run an evaluation](./runbooks/run-an-evaluation.md) — the results clone, the plan, offline and
  capped live runs, resume, compare, and committing a run.

## The policy itself

- [`policy/rules.md`](../policy/rules.md) — what is blocked.
- [`policy/decision.md`](../policy/decision.md) — Jev evidence and precedence.
- [`policy/classifier.md`](../policy/classifier.md) — the generative framework.

The selected framework combines with the rule list. `auto-mode print-prompt` prints that base
policy. The Jev request includes explicit Claude rules and action evidence separately.
