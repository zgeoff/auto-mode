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

auto-mode keeps the verbs `classify` and `record` for the two jobs below, and uses neither verb for
any other job. The verb table in [code-style](../code-style/SKILL.md) has no row for either job, so
the lint rule accepts both verbs, and you check in review that each function does its verb's job.
Both jobs may do I/O, which the table's `pick` and `build` rows forbid.

- `classify…`: the function decides whether a tool call, or a part of one such as its target path,
  may go ahead, and returns that decision.
  [`classifyLocally`](../../../src/rules/classify-locally.ts) returns `escalate` for any tool call
  its local rules don't cover. For any other choice among known alternatives, use the table's `pick`
  verb, as [`pickClassifierLane`](../../../src/config/pick-classifier-lane.ts) does.
- `record…`: the function merges a finished tool call's result into the session state that auto-mode
  reads when it decides on a later tool call. [`recordScope`](../../../src/record-scope.ts) merges
  into the session's scope, and records nothing when no configured scope source is the session. Use
  `write…` when a function writes a whole value out, with no merge.

## The function-verb lint rule

When a caller outside your code sets a function's name, such as a script's `main`, and the
`zgeoff/function-verb` lint rule rejects that name, add it to the rule's `exemptNames` option in
[`.oxlintrc.json`](../../../.oxlintrc.json). Rename any other function that the rule rejects.
`bun run lint` shows each name it rejects.
