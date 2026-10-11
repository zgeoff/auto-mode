# Jev

Jev is the classifier that judges every call the deterministic stages leave open. It is a TypeSafe
model reached over its decision API: auto-mode sends it the facts of one call and a set of typed
questions, and Jev returns, for each question, a choice and a probability for each option. auto-mode
asks one question per block rule, "under this rule, must the pending action be refused?", with
`allow` and `block` as the options. The CLI then decides from the probabilities, not from Jev's
choices, so the threshold for a deny is auto-mode's setting and not the model's. Jev writes no
explanation, so every Jev deny carries a fixed reason for its rule, and [the judge](./judge.md),
when configured, reviews each one.

The [policy](../policy.md) owns the rules themselves and the framework Jev reads.
[The user message](../evidence/user-message.md) and
[settings and repository facts](../evidence/settings-and-repository.md) cover the evidence the
request carries.

## The request

The request holds the call and everything Jev may use to judge it, and nothing else:

- the policy text, with the rule list spliced into the Jev framework, and a short answer guidance
  that every question points to
- the user's own block entries from their Claude settings, each asked as a rule of its own
- the repository facts for the call's directory and the task scope summary, and the MCP servers the
  user configured
- the last direct user message, as the only current user evidence, and the rest of the task context
  marked as purpose only
- the complete action: the tool, its input and the current directory

The questions follow the policy's two tiers. Each `###` heading under the hard block section or the
soft block section becomes one question, and each configured entry becomes a question in the tier it
was configured in. A question's block option covers a missing fact as well as a match: when a fact
needed to rule out the rule's harm is absent, the right answer is block. Two hard rules, Policy
Tampering and Audit Tampering, carry a narrow clarification path, because their matches include
false positives that only the user can explain, and some rules carry extra guidance on which
evidence settles them.

The request never truncates the action or the user's message. When the request is larger than the
client's request cap, the client drops the delegated task first, then the original task, each with
an explicit note that it was omitted. When it is still too large, the call is a classifier failure.

## From answers to a verdict

The client checks the response before the CLI reads it: every requested answer must be present, each
answer's probabilities must sum to one within Jev's rounding, and the chosen option must carry the
highest probability. A response that fails any check is a classifier failure, not a guess.

A rule blocks when its block probability reaches the configured threshold, whatever Jev chose. The
shipped threshold sits well below an even split, so a rule Jev chose to allow, but with real doubt,
still blocks. The deny holds the blocking rule with the highest block probability, a hard rule wins
a tie, and the earlier rule in the policy wins after that. Its reason states the harm the rule
covers and what clears it, in one of two forms: the action matches the rule, when Jev chose block,
or the evidence cannot rule out the harm, when Jev chose allow but the probability still reached the
threshold.

The rule the judge reviews is not always the rule the deny holds. A hard rule never clears, so when
any hard rule blocks, the judge reviews that hard rule, even if a soft rule ranks above it.
Reviewing the soft rule instead would let consent in the user's message clear an action that a hard
rule also blocks. Once the judge has reviewed a deny, the deny holds the reviewed rule and its
reason, whichever rule ranked first.

## Failure

Jev fails at one of four steps, and the action log records which: finding the API key, gathering the
evidence, sending the request, or reading the response. Every failure ends in the configured failure
response. Under the default, the CLI writes no verdict and the mod keeps the prompt. Under the
other, the CLI denies as `Classifier Unavailable`, a rule name that belongs to no rule in the
policy, with the failure as its reason. The judge never reviews that deny, because there is no rule
to review, and the denial budget counts it like any other. A failure writes a note to stderr whether
or not the CLI was asked to explain itself, so a user who sees the prompt return can find out why.

Gathering the repository facts or the MCP servers can fail on its own without failing the call: the
request then goes without them. Reading the user's Claude settings cannot, because the configured
block entries are rules the user wrote, and judging without them would drop a restriction. The CLI
reads those settings before the local rules run, so unreadable settings end every call in the
failure response, read-only calls included.

The call to Jev has its own time limit, and the CLI also honours the deadline the mod passes,
whichever comes first. A cancelled call and a call past the deadline are both failures.

## The Messages API classifiers

The configuration also defines classifiers that use the Anthropic Messages API: presets for Claude,
GLM and Spark, and a generic kind for any Anthropic-compatible gateway. They read the generative
framework instead of the Jev one, see the user's last message as their only history, and answer in
tags that hold a block flag, a rule and a reason. A reply with no block tag reads as an allow. The
mod never uses them, because it always runs the CLI in its Jev-only mode, so they serve callers of
the library and of the CLI by hand.
