# auto-mode

A permission classifier that runs as a hook. It reads the agent's next action and
decides allow or block, so you can leave an agent unattended without approving
every step.

Built for coding agents that are **not** Claude, running in harnesses that are not
Claude Code. Claude Code has its own auto mode; this gives the same shape to the
models and harnesses that do not.

## Status

Early. The policy is written; the code is not.

## The policy

[`policy/rules.md`](policy/rules.md) is the shipped default. Read it before you
turn this on. It is prose, not code, so that you can read it, diff it, and
replace it.

## How it works

Two tiers.

1. **Local rules.** Deterministic matching against the action. No network call.
   This catches the common cases in under a millisecond.
2. **Model.** Anything the local tier cannot settle goes to a small reasoning
   model with the policy as its prompt. This costs seconds.

Tier 1 must catch the majority, or tier 2 makes the session unusable.

## Harnesses

Claude Code, Codex, and Muse Code. They differ in how the hook is registered and
in the payload shape; the verdict contract is the same.
