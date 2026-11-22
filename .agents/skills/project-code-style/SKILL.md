---
name: project-code-style
description:
  "auto-mode's additions to the shared code-style skill: the two verbs it keeps for its own jobs,
  and where to list a name that the `zgeoff/function-verb` lint rule must skip. Load it beside
  code-style before you write or review TypeScript in auto-mode."
metadata:
  kind: rule-set
---

# auto-mode code style

## Departures

None.

## auto-mode's verbs

Use the verbs `classify` and `record` only for the two jobs below. The verb table in
[code-style](../code-style/SKILL.md) has no row for either job. The lint rule accepts both verbs, so
check in review that each function does its verb's job. Both jobs may do I/O, which the table's
`pick` and `build` rows forbid.

- Name a function `classify…` when it decides whether a tool call, or a part of one such as its
  target path, may go ahead, and returns that decision.
  [`classifyLocally`](../../../src/rules/classify-locally.ts) returns `escalate` for any tool call
  its local rules don't cover. For any other choice among known alternatives, use the table's `pick`
  verb, as [`pickClassifierLane`](../../../src/config/pick-classifier-lane.ts) does.
- Name a function `record…` when it merges a finished tool call's result into the session state that
  auto-mode reads when it decides on a later tool call.
  [`recordScope`](../../../src/record-scope.ts) merges into the session's scope, and records nothing
  when no configured scope source is the session. Use `write…` when a function writes a whole value
  out, with no merge.

## The function-verb lint rule

When a caller outside your code sets a function's name, such as a script's `main`, and the
`zgeoff/function-verb` lint rule rejects that name, add it to the rule's `exemptNames` option in
[`.oxlintrc.json`](../../../.oxlintrc.json). Rename any other function that the rule rejects. Run
`bun run lint` to see each name it rejects.
