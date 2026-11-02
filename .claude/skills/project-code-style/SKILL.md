---
name: project-code-style
description:
  "auto-mode's additions to the shared code-style skill: the two verbs it keeps for its own jobs,
  and where the verb rule's exempt names go. Load it beside code-style before you write or review
  TypeScript in auto-mode."
metadata:
  kind: rule-set
---

# auto-mode code style

## Departures

None.

## auto-mode's verbs

auto-mode keeps the verbs `classify` and `record` for the two jobs below, and uses neither for any
other job. Neither job has a row in code-style's role table, so each verb is a
[free verb](../code-style/SKILL.md#free-verbs). Both may do I/O. No lint rule checks the job behind
a free verb, so check it in review.

- Name a function `classify…` when it returns which outcome of a fixed set applies to its input,
  such as [`classifyLocally`](../../../src/rules/classify-locally.ts), which returns `allow` or
  `escalate`. Use `pick…` when the function returns one of the values it was given.
- Name a function `record…` when it merges a finished tool call's result into the saved state that
  auto-mode reads when it judges a later tool call, such as
  [`recordScope`](../../../src/record-scope.ts), which adds to the session's scope. Use `write…`
  when it writes a whole value out.

## Exempt names

- Add an entry point that the `zgeoff/function-verb` lint rule must skip, such as a script's `main`,
  to the rule's `exemptNames` option in [`.oxlintrc.json`](../../../.oxlintrc.json). Rename any
  other function that the rule rejects.
