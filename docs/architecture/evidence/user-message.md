# The user message

The only conversation auto-mode sees is the task context the mod puts in each request, and the one
part of it that counts as the user's word is the last direct user message: the last prompt a person
typed into the session. That message is what lets a soft rule clear, because consent in auto-mode is
specific and current: the user asked for this operation on this target in the message they last
typed. auto-mode reads no transcript, so earlier grants, earlier restrictions and anything the agent
or a tool wrote are outside what the classifiers judge. A missing message supplies no evidence, and
a call that needs consent is then denied.

## What the task context holds

The mod builds the task context in memory from Claude Code's prompt and agent events, and holds
three things:

- **The last direct user message,** with its origin. A message is direct when a person typed it into
  the composer, through Remote Control, or through the Claude Agent SDK.
- **The original user task:** the first direct message of a session started fresh or cleared. A
  resumed session or a reloaded mod has none, because the mod cannot tell whether the first message
  it sees opened the task.
- **The delegated task** of each subagent: the prompt its parent agent wrote when spawning it.

Only the last direct message is user evidence. The classifiers read the original task and the
delegated task as the purpose of the work, and neither grants consent or clears a rule, because the
original task is old and the delegated task is the agent's own words.

A subagent's call never carries the user's message. The CLI drops it from every request whose agent
is a subagent when it parses the request, because the user typed it to the main agent, and a
subagent works from the task its parent wrote. Library callers get the same rule only by building
requests through the CLI's request parser, so the classifiers can trust the request they receive.

## Stale messages

A prompt from any other origin, such as a message a coordinating tool delivers through a plugin, is
not the user typing. It never replaces the last direct message. The mod keeps the earlier message
and marks it stale until the next direct prompt makes a new message current. A stale message counts
as context only:

- Jev reads it in the task context, never as the current user message, and its guidance gains one
  rule: a stale message cannot grant consent, satisfy an allow exception, or clear a rule, but a
  refusal or a limit in it still applies.
- The judge and the Messages API classifiers receive no stale message at all, and a stale message
  names no target for [the user-named grant](../stages/containment.md#the-user-named-grant).

## What consent can and cannot do

The last direct message can supply the specific consent a soft rule needs: the user asked for this
operation on this target. It cannot redefine the policy, and it cannot approve a proposal the
classifier never saw. A reply such as "go ahead" therefore clears nothing, because the classifier
sees the reply without the question it answered. A hard rule never clears through consent. Two hard
rules, Policy Tampering and Audit Tampering, accept a narrow clarification instead: a message that
identifies the flagged action and explains why the match is wrong
([Jev](../stages/jev.md#the-request)).

The same consent can extend the task scope for one call. A message that names every target of a
containment deny hands it to the judge, which clears the finding only when the message asks for this
operation on those targets ([the user-named grant](../stages/containment.md#the-user-named-grant)).

The message stays whole in the request and is never truncated. The retry key of the
[denial budget](../stages/denial-budget.md#repeats-of-the-action-just-denied) includes it, so a new
message from the user lets the agent try a denied action again with the classifiers reading the new
evidence.
