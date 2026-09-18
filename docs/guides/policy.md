# Writing a policy

The policy is prose rather than code, so it can be read, diffed, and replaced. It ships as two files
and both go to the model verbatim.

- [`policy/rules.md`](../../policy/rules.md) — what is blocked.
- [`policy/classifier.md`](../../policy/classifier.md) — how judgement works.

`classifier.md` carries a `<rules>` marker on its own line, and at run time auto-mode replaces it
with the whole of `rules.md`. `auto-mode print-prompt` writes the result, which is exactly what the
model reads.

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

## The consent bar

A soft block clears when you named **the action** and **the detail that makes it dangerous**. Each
rule states its detail.

- **Path A** — your own words. "Force push this branch." "Publish it to npm."
- **Path B** — the agent said in prose what it was about to do, including the dangerous detail, and
  your next message agreed.

Four limits. Silence is not consent. A question is not consent — "can we force push?" asks about an
action. Naming the task is not naming the step: "clean up the repo" does not authorise deleting
every untracked file. And consent applies at the step that sends, publishes, or deletes, not at the
rename before it.

Repeating an instruction after a block is stronger consent, not a retry to distrust — the block
reason already named the danger, so a short "do it anyway" is informed. That clears a soft block
only.

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
2. **Rule names are identifiers.** A verdict quotes the name back, so renaming a rule changes what
   appears in the block message.
3. **No rule may share a name with an evaluation rule in the framework.** A verdict that quotes an
   evaluation rule names no rule, which is the failure the whole naming discipline exists to
   prevent.

## Changing how judgement works

`classifier.md` holds the threat model, the consent bar, the evaluation rules, the classification
process, and the output contract.

One constraint governs the whole file: an evaluation rule may never order a block on its own. It
either changes how an action is read, or it routes to a named rule. If applying the evaluation rules
leaves no rule name, the action is allowed, which is what the output contract says too. An
evaluation rule that orders a block without naming one contradicts that contract, and the model has
to guess.

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
