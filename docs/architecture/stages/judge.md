# The judge

The judge is a second model that reviews every deny [Jev](./jev.md) gives. It is on by default, and
the configuration can turn it off, which leaves every Jev deny with its fixed reason. Jev answers
with probabilities and no explanation, and its threshold is set low on purpose, so some of its
denies come from doubt rather than a match. The judge reads the denied rule, the call and the user's
last message, and either confirms the deny with a reason written for this call, or overturns it to
an allow when the user asked for exactly this or when the facts show that no rule covers the action.
It is a generative model, Claude Code on a Claude model by default, with its own framework in the
[policy](../policy.md). The judge can only change a deny into an allow on a soft rule, and it fails
closed: whatever goes wrong, the deny stands. It also reviews a containment deny whose every target
the user named ([a containment deny](#a-containment-deny)).

## What the judge reads

The judge reviews every deny of one prompted call in one turn, so a call never waits on two judge
reviews. It reads one JSON value holding each denied rule in order, with its tier, its source, its
full text and the basis of the deny, then the complete action, the last direct user message, and the
repository facts Jev had. The evidence travels as one JSON value, so a user message or a command
that holds a closing tag cannot end its own field early. The judge reads no stale user message,
because a message the user typed before a relayed turn cannot grant consent
([the user message](../evidence/user-message.md)).

The default judge is one Claude Code process per agent session, which the Agent SDK drives over
streaming input. The process runs with no tools, no settings, no MCP servers and no session file, in
a scratch directory, so it cannot act and no hook of the user's session runs inside it. The judge
framework is its system prompt, which Claude caches across reviews. The judge answers in plain text
rather than through Claude Code's schema output, because a schema answer costs further model turns
on every review. Each review sends one user turn and then clears the conversation, so one review's
evidence never reaches the next. A change of model or framework starts a new process. The judge
server owns the process, because each CLI run ends with its call: the
[overview](../overview.md#topology) covers the topology. The CLI strips the variables that point
Claude Code at another provider from the child's environment, because the agent's own session often
runs a non-Claude model through such a gateway, and the judge must reach Claude through the user's
own Claude login.

When a request trips a safety stop, Claude Code answers it on a fallback model, so the judge reads
the model that wrote the reply from the turn's per-model usage: the model with the most output
tokens, which passes over a background model and a model that wrote nothing. A fallback that Claude
Code keeps for the rest of the session ends the process, so the next review starts again on the
configured model. The configuration can name a Messages API model as the judge instead. Jev itself
can never be the judge, because it writes no reasons.

## Confirm or overturn

The judge answers one JSON object that holds one review per deny, in the evidence's order, each
naming its rule. A review holds a verdict and a non-empty reason, and an overturn also holds a
basis. A reply that skips, adds or reorders a rule leaves every review unreadable, because it could
pin one rule's verdict on another. The recorded evaluation replies to a single deny hold one verdict
in tags, and the CLI reads those too. The CLI turns each review into one of four outcomes:

| Outcome    | When                                                                     | The agent receives                     |
| ---------- | ------------------------------------------------------------------------ | -------------------------------------- |
| confirmed  | the judge confirms                                                       | the deny, with the judge's reason      |
| overturned | the judge overturns a soft rule on a basis the configuration accepts     | an allow                               |
| held       | the judge overturns a hard rule, or on a basis the configuration rejects | the deny, with the rule's fixed reason |
| failed     | the judge times out, fails, or writes an unreadable reply                | the deny, with the rule's fixed reason |

The judge overturns on one of two bases. Consent means that in the last message the user asked for
this operation on this target. Misread means that the supplied facts put the action outside the rule
altogether. The configuration accepts both bases by default, and can accept consent alone, which
holds every misread overturn. A hard rule never clears, and neither does a configured hard deny
entry, which counts as a hard rule: an overturn of either is held. A held deny carries the rule's
fixed reason rather than the judge's, because the judge's reason argues for the allow.

A confirmed reason reaches the agent behind a fixed prefix that holds the rule name, flattened to
one line and cut at a word boundary to a bounded length, so a long judgement never floods the
agent's context.

## Time and failure

The judge has its own time limit, longer than Jev's because it writes, and it also honours the
deadline the mod passes, whichever comes first. A missing API key, a policy that cannot load, a
timeout, a failed call and an unreadable reply all end in the failed outcome.

## A containment deny

The judge also reviews a [containment](./containment.md) deny when the last direct user message
names every target of it ([the user-named grant](./containment.md#the-user-named-grant)), in the
same turn as any Jev deny of the call. That deny reads the Outside Task Scope rule from its own
policy file in place of a rule from the rule list, and two more evidence fields: the check's
finding, which names every target and what the task owns, and each target paired with the word of
the message that names it. The rule tells the judge that a name alone is not consent, and that a
target named as a source to read, a place to look or a reference is none.

The review is a soft rule that only consent clears. A misread overturn is held whatever the
configuration accepts, because the task scope is a fact the check read and the judge has no better
reading of it. A held or failed review keeps the check's own reason, which names the targets, and a
confirmed one carries the judge's reason behind the fixed prefix. The action log records the review
of the containment deny in a field of its own, apart from the review of the Jev deny.
