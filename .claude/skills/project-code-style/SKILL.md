---
name: project-code-style
description:
  auto-mode's additions to the shared code-style skill — what its own function verbs mean and the
  comment rules. Load it beside code-style before writing, reviewing, or renaming any TypeScript in
  auto-mode.
---

# auto-mode code style

The shared `code-style` skill holds the rules and the function-verb taxonomy. This skill holds only
what auto-mode adds: the meaning of its own verbs, and the rules for comments.

## Project verbs

auto-mode adds these verbs to the shared taxonomy. A new verb goes here and into the `verbs` option
of `zgeoff/function-verb` in [`.oxlintrc.json`](../../../.oxlintrc.json) in the same PR, and
`check-project-verbs.sh` fails when the two lists differ.

- `classify`: decide which category a value falls into, from a closed set the caller knows
  (`classifyLocally`, `classifySegment`). It differs from `check`, which reports findings rather
  than returning a category.
- `record`: add what a finished action created to the state a later action reads (`recordScope`). It
  differs from `write`, which persists a value the caller already holds.

## Exempt names

The verb rule skips these names, which also sit in the `exemptNames` option beside `verbs`.

- `main`, a script entrypoint

## Comments

- No JSDoc; `zgeoff/no-jsdoc` enforces it. A fact a reader needs belongs in the code, a named
  constant, a test whose name states it, the commit body, or `docs/`.
- A `//` comment holds one thing: the reason the obvious alternative is wrong, when the cause lives
  outside the file, such as a harness quirk, a library defect, or a measured number. Three lines at
  most.
- Comments describe the code as it is: no history, no project state, and no naming of other
  declarations, which a rename strands.
