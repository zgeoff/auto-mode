# Writing a policy

Read this guide before you change the block rules or how Jev, the classifier that judges each
escalated action, reads them, and before you run auto-mode outside an isolated environment.

The policy is prose, so you can read, diff and replace it. Jev's policy is two files:

- [`policy/rules.md`](../../policy/rules.md) — the rule file, with the rules for what Jev blocks.
  Set `policy.rulesPath` to replace it.
- [`policy/decision.md`](../../policy/decision.md) — the framework for how Jev judges the supplied
  evidence. Set `policy.frameworkPath` to replace it.

The judge, the model that reviews each Jev deny, reads `policy/judge.md` as its framework. No
setting replaces that file, and the judge takes the same rule file. Each framework carries a
`<rules>` marker on its own line, and at run time auto-mode replaces the marker with the whole of
the rule file. `auto-mode print-prompt` writes the result, which excludes the imported user settings
and the proposed action.

When you edit a file under `policy/`, write only for the model, and keep guidance for people in
these docs, so the model never receives instructions meant for a person.

## Allow by default

auto-mode blocks an action only when it can name a rule: one the action matches, or one the evidence
cannot rule out. Most actions match nothing.

The rest of the policy is built around that default. People switch off a classifier that blocks
routine work, and a switched-off classifier blocks nothing.

## The target environment

The shipped rules assume an isolated environment: a container or virtual machine that holds the
task's checkout and the credentials mounted for it, with no route in from outside. A rule describes
only catastrophic harm: losing work the task does not own, writing to the default branch or to
production, publishing or sending data outward, changing credentials or access from outside, or
disabling auto-mode. Tolerable risk has no rule, apart from the one case below where a rule still
applies. A scheduled job, root access, or a port bound inside the environment grants nobody outside
a way in, so no rule covers it. Losing work the task does not own is still catastrophic inside the
environment.

Discarding the task's own uncommitted changes, such as `git checkout -- .` in the task's worktree,
is an accepted tolerable risk: the agent can redo its own work. Uncommitted Work Destruction still
blocks it when the user or the task context says to keep the changes or that someone else made them.

On a personal machine that premise does not hold, and you accept more risk when you run auto-mode
there. These actions run without a deny. The last one runs without a deny anywhere, unless the user
or the task context says to keep the changes or that someone else made them:

- A crontab entry, a systemd unit, a launch agent, or a shell startup file.
- `sudo`, a sudoers entry, and a `chmod` or `chown` that widens access.
- A server bound to every interface, or a published container port.
- Discarding uncommitted changes in the task's own worktree.

To stop them, add configured deny entries to the user Claude settings, as described in
[Allowlists](./allowlists.md). A configured deny entry is catastrophic by definition. While any deny
entry exists, every action goes to Jev, reads included, so each one costs a model call.

```json
{
  "autoMode": {
    "soft_deny": [
      "Installing a crontab entry, a systemd unit or timer, a launch agent, or a line in a shell startup file such as ~/.bashrc or ~/.zshrc.",
      "Running a command with sudo, editing sudoers, or widening file access with chmod or chown.",
      "Binding a server to an address other than loopback, or publishing a container port on every interface.",
      "Discarding uncommitted changes with git checkout --, git restore, git reset --hard, git clean, or git stash drop."
    ]
  }
}
```

## Two tiers of rule

**HARD BLOCK** — blocks whenever it matches, except on the one path below for two of these rules.
Ordinary consent does not clear these, because they create a risk that is not visible from inside
the session. Data Exfiltration is the clearest case: naming the destination does not make the send
safe, because the contents are still unseen.

Two hard rules are self-protection — Policy Tampering and Audit Tampering — and they match patterns
of text, so an innocent line can match by accident. They clear only when you have seen what was
flagged and say why the match is wrong. Agreeing to proceed does not clear them.

**SOFT BLOCK** — blocks unless you authorised this exact action, a configured allow entry covers it,
or a shipped exception does. These are real work that people do on purpose: force-pushing,
publishing, dropping a table.

## User consent

Jev reads the configured standing permissions and the last direct user message. A soft block can
clear when that message names the action and the dangerous target the rule requires. “Force push
branch feature-x” supplies those details. “Go ahead” does not: Jev never sees the proposal it
answers.

Conversation text cannot rewrite the configured policy, and Jev never sees earlier grants and
restrictions. Put standing exceptions in the user Claude settings as described in
[Configuration](./configuration.md#import-claude-rules).

Jev judges only the supplied evidence, so it does not weigh an interrupted action or an earlier
credential read that it cannot see. If a fact needed to rule out a rule's harm is missing from the
action, Jev denies the action and names the rule it could not settle. It does not infer that a
resource belongs to the agent or that an unseen script is safe.

## False-positive clarification

The shipped Policy Tampering and Audit Tampering rules can clear when the last direct user message
identifies the questioned finding or flagged action and explains why the match is wrong. Jev checks
that explanation against the supplied action and configuration. Bare consent does not clear the
rules, and claims in tool input cannot supply the clarification. When a fact is missing, Jev denies
the action. This path covers only these two shipped rules. Other hard blocks and configured hard
denies keep their priority.

When you set `rulesPath`, your rules lose this exception, even a rule with the same title as a
shipped one.

## Exceptions

The shipped exceptions cover work the rules above would otherwise block: regenerable output, scratch
space, local and development services, read-only actions, formatters and linters, the current
feature branch, and dry runs.

Test any change against `rm -rf node_modules`. It matches the wording of a deletion rule yet is
routine, so a classifier most easily blocks it by mistake.

## Changing the rules

Copy `policy/rules.md`, edit the copy, and point `policy.rulesPath` at it:

```json
{ "policy": { "rulesPath": "/home/you/my-rules.md" } }
```

Your file replaces the shipped one whole. Follow these constraints:

1. **Keep the three headings** — `HARD BLOCK rules`, `SOFT BLOCK rules`, `ALLOW exceptions`. The
   classifier refers to them by name.
2. **Rule names are identifiers.** auto-mode includes the matching rule name in each denial.
   Renaming a rule changes the denial message.
3. **Give no rule the name of an evaluation rule in the framework.** A verdict that quotes an
   evaluation rule has no matching block rule.

## Changing how judgement works

Jev's framework holds the consent rules and evaluation instructions. Copy `policy/decision.md`, edit
the copy, keep its `<rules>` line, and point `policy.frameworkPath` at it. auto-mode refuses a
framework without that line.

Never write an evaluation rule that orders a block on its own. Each evaluation rule either changes
how Jev reads an action or routes to a named rule. If applying the evaluation rules yields no
matching block rule, the action is allowed. An evaluation rule that orders a block without naming a
block rule leaves the model to guess.

## Testing a change

```sh
auto-mode print-prompt | less
```

Then run an action request through it. `fixtures/mod-request-write.json` holds a request that the
mod recorded; edit its `toolName` and `toolInput`:

```sh
auto-mode run --explain < fixtures/mod-request-write.json
```

`--explain` writes which stage answered, such as the local tier, Jev or the judge, and which rule or
exception it named. Test a rule change against a handful of commands whose correct verdicts you
already know, including ones that should be allowed.
