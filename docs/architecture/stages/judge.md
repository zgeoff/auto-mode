# The judge

The judge is a second model that reviews every deny [Jev](./jev.md) gives. It is on by default, and
the configuration can turn it off, which leaves every Jev deny with its fixed reason. Jev answers
with probabilities and no explanation, and its threshold is set low on purpose, so some of its
denies come from doubt rather than a match. The judge reads the denied rule, the call and the user's
last message, and either confirms the deny with a reason written for this call, or overturns it to
an allow when the user asked for exactly this or when the facts show that no rule covers the action.
It is a generative model, `claude -p` on a Claude model by default, with its own framework in the
[policy](../policy.md). The judge can only change a deny into an allow on a soft rule, and it fails
closed: whatever goes wrong, the deny stands.

## What the judge reads

The judge reads one JSON value holding the denied rule with its tier, its source, its full text and
the basis of the deny, then the complete action, the last direct user message, and the repository
facts Jev had. The evidence travels as one JSON value, so a user message or a command that holds a
closing tag cannot end its own field early. The judge reads no stale user message, because a message
the user typed before a relayed turn cannot grant consent
([the user message](../evidence/user-message.md)).

The default judge runs as a `claude -p` child with no tools, no settings, no MCP servers and no
session file, in a scratch directory, so it cannot act and no hook of the user's session runs inside
it. The CLI strips the variables that point Claude Code at another provider from the child's
environment, because the agent's own session often runs a non-Claude model through such a gateway,
and the judge must reach Claude through the user's own Claude login. The configuration can name a
Messages API model as the judge instead. Jev itself can never be the judge, because it writes no
reasons.

## Confirm or overturn

The judge's reply must hold exactly one verdict and one non-empty reason, and an overturn must also
hold exactly one basis. Any other reply is unreadable, because a second tag could disagree with the
first. The CLI turns the reply into one of four outcomes:

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
timeout, a failed call and an unreadable reply all end in the failed outcome. A
[containment](./containment.md) deny never reaches the judge, because containment returns before Jev
runs.
