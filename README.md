# auto-mode

A permission classifier that runs as a hook. It reads the agent's next action and
decides allow or block, so you can leave an agent unattended without approving
every step.

Built for coding agents that are **not** Claude, running in harnesses that are not
Claude Code. Claude Code has its own auto mode; this gives the same shape to the
models and harnesses that do not.

## Status

Early. The policy is written; the code is not.

## The three files

| File | Audience | Edit it when |
|---|---|---|
| `policy/rules.md` | The model | You want to change what is blocked |
| `policy/classifier.md` | The model | You want to change how judgement works |
| `README.md` | You | — |

`policy/classifier.md` holds the threat model, the consent bar, the evaluation
order, and the output contract. It carries a `<rules>` marker. At run time
auto-mode replaces that marker with the whole of `policy/rules.md`.

The split exists for two reasons. The framework stays identical across sessions,
so it sits at the front of the prompt and stays in the provider's cache. And you
can rewrite every rule without touching the output contract that the verdict
parser depends on.

**Read `policy/rules.md` before you turn this on.** If you disagree with a rule,
change the rule. Do not rely on the classifier to guess what you meant.

## How it works

Two tiers.

1. **Local rules.** Deterministic matching against the action. No network call.
   This catches the common cases in under a millisecond.
2. **Model.** Anything the local tier cannot settle goes to a small reasoning
   model with `policy/classifier.md` as its prompt. This costs seconds.

Tier 1 must catch the majority, or tier 2 makes the session unusable.

## Overriding

Point `rulesPath` at your own rule list, or `classifierPath` at your own
framework. auto-mode reads your file in place of the default and does not merge
the two: your file is the whole of that part.

A custom rule list must keep the three headings `HARD BLOCK rules`,
`SOFT BLOCK rules`, and `ALLOW exceptions`. The classifier refers to them by name.

To adjust rather than replace, copy the default and edit it. That is the
supported path, and the reason the policy ships as prose instead of code.

## Harnesses

Claude Code, Codex, and Muse Code. They differ in how the hook is registered and
in the payload shape; the verdict contract is the same.
