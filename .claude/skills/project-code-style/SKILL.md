---
name: project-code-style
description:
  auto-mode's additions to the shared code-style skill — what its own function verbs mean. Load it
  beside code-style before writing, reviewing, or renaming any TypeScript in auto-mode.
---

# auto-mode code style

The shared `code-style` skill holds the rules and the function-verb taxonomy. This skill holds only
what auto-mode adds: the meaning of its own verbs.

## Free verbs

auto-mode gives two free verbs a fixed meaning, so each one names the same job everywhere in the
repo. `zgeoff/function-verb` passes any verb it does not ban, so neither verb needs a lint option.

- `classify`: decide which category a value falls into, from a closed set the caller knows
  (`classifyLocally`, `classifySegment`). It differs from `check`, which reports findings rather
  than returning a category.
- `record`: add what a finished action created to the state a later action reads (`recordScope`). It
  differs from `write`, which persists a value the caller already holds.

## Exempt names

The verb rule skips these names, which also sit in its `exemptNames` option in
[`.oxlintrc.json`](../../../.oxlintrc.json).

- `main`, a script entrypoint
