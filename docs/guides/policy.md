# Writing a policy

The policy is prose, not code, so that you can read it, diff it, and replace it.
It ships as two files and both go to the model verbatim.

- [`policy/rules.md`](../../policy/rules.md) — what is blocked.
- [`policy/classifier.md`](../../policy/classifier.md) — how judgement works.

`classifier.md` carries a `<rules>` marker on its own line, and at run time
auto-mode replaces it with the whole of `rules.md`. `auto-mode print-prompt`
writes the result, which is exactly what the model reads.

Nothing under `policy/` addresses you. Guidance about editing lives here, in the
docs, so the model never reads instructions meant for a person.

## The default is allow

Block an action only when you can name the rule it matches. Most actions match
nothing.

This is the whole design. A classifier that blocks routine work is one you turn
off, and a tool you turn off protects nothing.

## Two tiers of rule

**HARD BLOCK** — blocks whenever it matches. Ordinary consent does not clear
these, because they create a risk you cannot see from inside the session. Data
Exfiltration is the clearest case: a named destination does not make it safe,
because you cannot see what is being sent.

Two hard rules are self-protection — Policy Tampering and Audit Tampering — and
they match patterns of text, so an innocent line can match by accident. Those two
clear on one narrow path: you, having been shown what was flagged, say why the
match is wrong. Agreeing to proceed is not that.

**SOFT BLOCK** — blocks unless you authorised this exact action. These are real
work that people do on purpose: force-pushing, publishing, dropping a table.

## The consent bar

A soft block clears when you named **the action** and **the detail that makes it
dangerous**. Each rule states its detail.

- **Path A** — your own words. "Force push this branch." "Publish it to npm."
- **Path B** — the agent said in prose what it was about to do, including the
  dangerous detail, and your next message agreed.

Four limits. Silence is not consent. A question is not consent — "can we force
push?" asks about an action. Naming the task is not naming the step: "clean up
the repo" does not authorise deleting every untracked file. And consent applies
at the step that sends, publishes, or deletes, not at the rename before it.

Repeating an instruction after a block is stronger consent, not a retry to
distrust — the block reason already named the danger, so a short "do it anyway"
is informed. That clears a soft block only.

## Exceptions are what make it usable

Seven of them, and they exist because the rules above would otherwise block
ordinary work: regenerable output, scratch space, local and development services,
read-only actions, formatters and linters, the current feature branch, and dry
runs.

`rm -rf node_modules` is the one to keep in mind. It looks like the most
destructive command a rule could name and it is completely routine. A classifier
that blocks it is a classifier you stop using by Thursday.

## Changing the rules

Copy the shipped file, edit it, and point at it:

```json
{ "rulesPath": "/home/you/my-rules.md" }
```

Your file replaces the shipped one whole. Three constraints:

1. **Keep the three headings** — `HARD BLOCK rules`, `SOFT BLOCK rules`,
   `ALLOW exceptions`. The classifier refers to them by name.
2. **Rule names are identifiers.** A verdict quotes the name back, so renaming a
   rule changes what appears in the block message.
3. **No rule may share a name with an evaluation rule in the framework.** A
   verdict that quotes an evaluation rule names no rule, which is the failure the
   whole naming discipline exists to prevent.

## Changing how judgement works

Rarer, and a sharper edge. `classifier.md` holds the threat model, the consent
bar, the evaluation rules, the classification process, and the output contract.

One rule governs the whole file: **an evaluation rule may never order a block on
its own.** It either changes how an action is read, or it routes to a named rule.
If applying the evaluation rules leaves no rule name, the action is allowed —
which is also what the output contract says. Break that and you get a prompt that
instructs a block and forbids it in the same breath.

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

`--explain` writes which tier answered and which rule or exception it named. The
cheapest test of a rule change is a handful of commands you already know the
answers to, half of which should be allowed.
