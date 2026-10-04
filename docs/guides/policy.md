# Writing a policy

The policy is prose rather than code, so it can be read, diffed, and replaced. It ships as two files
and the selected framework combines with the rule file.

- [`policy/rules.md`](../../policy/rules.md) — what is blocked.
- [`policy/decision.md`](../../policy/decision.md) — how Jev judges the supplied evidence.
- [`policy/classifier.md`](../../policy/classifier.md) — the Messages API framework.

Each framework carries a `<rules>` marker on its own line, and at run time auto-mode replaces it
with the whole of `rules.md`. `auto-mode print-prompt` writes the result, which excludes the
imported user settings and proposed action.

Nothing under `policy/` addresses the reader of these docs. Guidance about editing lives here
instead, so the model never receives instructions meant for a person.

## The default is allow

Block an action only when you can name the rule it matches. Most actions match nothing.

The rest of the policy is built around that default. A classifier that blocks routine work gets
switched off, and then it stops all of it.

## Two tiers of rule

**HARD BLOCK** — blocks whenever it matches. Ordinary consent does not clear these, because they
create a risk that is not visible from inside the session. Data Exfiltration is the clearest case:
naming the destination does not make the send safe, because the contents are still unseen.

Two hard rules are self-protection — Policy Tampering and Audit Tampering — and they match patterns
of text, so an innocent line can match by accident. Those two clear on one narrow path: you, having
been shown what was flagged, say why the match is wrong. Agreeing to proceed is not that.

**SOFT BLOCK** — blocks unless you authorised this exact action. These are real work that people do
on purpose: force-pushing, publishing, dropping a table.

## User consent

The Jev framework uses configured standing permissions and the last direct user message. A soft
block can clear when that message specifies the action and the dangerous target required by the
rule. “Force push branch feature-x” supplies those details. “Go ahead” cannot supply an unseen
proposal.

Conversation text cannot rewrite the configured policy. Earlier grants and restrictions are
unavailable. Put standing exceptions in the user Claude settings as described in
[Configuration](./configuration.md#import-claude-rules).

Jev judges only the supplied evidence. An unseen interrupted action or earlier credential read is
outside the assessment. If an action requires facts that its own input does not include, the
classifier can return manual approval. It does not infer that a resource belongs to the agent or
that an unseen script is safe.

## Exceptions

Seven, covering work the rules above would otherwise block: regenerable output, scratch space, local
and development services, read-only actions, formatters and linters, the current feature branch, and
dry runs.

`rm -rf node_modules` is the case to test any change against. It matches the wording of a deletion
rule and is routine, so it is where a classifier most easily goes wrong in the expensive direction.

## Changing the rules

Copy the shipped file, edit it, and point at it:

```json
{ "rulesPath": "/home/you/my-rules.md" }
```

Your file replaces the shipped one whole. Three constraints:

1. **Keep the three headings** — `HARD BLOCK rules`, `SOFT BLOCK rules`, `ALLOW exceptions`. The
   classifier refers to them by name.
2. **Rule names are identifiers.** The hook includes the matching rule name in each denial. Renaming
   a rule changes the denial message.
3. **No rule may share a name with an evaluation rule in the framework.** A verdict that quotes an
   evaluation rule has no matching block rule.

## Changing how judgement works

The selected framework holds the consent rules and evaluation instructions.

One constraint governs the whole file: an evaluation rule may never order a block on its own. It
either changes how an action is read, or it routes to a named rule. If applying the evaluation rules
yields no matching block rule, the action is allowed. An evaluation rule that orders a block without
naming one contradicts that contract, and the model has to guess.

## Testing a change

```sh
auto-mode print-prompt | less
```

Then run a payload through it:

```sh
echo '{"hook_event_name":"PreToolUse","prompt_id":"x","tool_name":"Bash",
       "cwd":"/repo","tool_input":{"command":"rm -rf node_modules"}}' \
  | auto-mode run --explain
```

`--explain` writes which tier answered and which rule or exception it named. Test a rule change
against a handful of commands whose correct verdicts you already know, including ones that should be
allowed.
