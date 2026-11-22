# The policy

The policy is what the models read: the block rules, the exceptions that clear them, and a framework
for each model on how to judge against them. It lives as Markdown files under `policy/` at the repo
root and ships in the package, and every byte of it is model input. The formatter leaves the files
alone, because their bytes are the prompt and the cache prefix. A reflow changes the prompt, so make
it in its own commit and review it as a prompt change. [Writing a policy](../guides/policy.md)
covers changing the rules, and [Jev](./stages/jev.md) covers how a rule becomes a question.

## The files

| File             | Read by     | Holds                                                            |
| ---------------- | ----------- | ---------------------------------------------------------------- |
| `rules.md`       | both models | the hard block rules, the soft block rules, the allow exceptions |
| `decision.md`    | Jev         | the framework for typed questions                                |
| `judge.md`       | the judge   | the framework for reviewing a deny                               |
| `containment.md` | the judge   | the Outside Task Scope rule for reviewing a containment deny     |
| `denial.md`      | the agent   | the instruction every deny reason ends with                      |

Each framework holds a `<rules>` marker, and the policy loader replaces the first marker with the
rule list, so Jev and the judge read one rule list. The Outside Task Scope rule in `containment.md`
is not part of that list: the containment check gives that deny, and the judge reads the rule only
to review it. A framework with no marker fails to load, because the rules would have nowhere to go,
and a failed load is a classifier failure. In the configuration, you can replace the rule list or
the framework with a file of your own. `auto-mode print-prompt` prints the assembled policy for the
configured classifier.

The instruction in `denial.md` reaches the agent, never Jev or the judge. It holds the agent's
instructions: never reach the same result another way, carry on along a safer path, and, when none
exists, finish the rest of the task before telling the user what the blocked step needs. A deny
still reaches the agent when that file cannot be read, only without the instruction, because a
missing file must not make the CLI exit without a verdict.

## The rules

The rule list has sections for hard block rules, soft block rules and allow exceptions. A hard block
rule never clears on consent, a configured allow entry or an allow exception. Of the hard rules,
only Policy Tampering and Audit Tampering accept a narrow false-positive clarification from the
user: a statement that the match is wrong. The clarification grants no consent. The judge can still
overturn a hard deny, but only as a misread of the action, and only when Jev itself chose allow with
a low block probability ([the judge](./stages/judge.md#confirm-or-overturn)). A soft block rule
clears with specific consent in the user's last message, a configured allow entry, or a shipped
allow exception. An allow exception, such as regenerable output or the current feature branch,
clears soft rules only.

A block rule exists to describe catastrophic harm, such as lost work the task does not own, a write
to the default branch or to production, data sent off the machine, changed credentials, or auto-mode
disabled. An action whose risk is tolerable has no rule and is allowed. The rules assume the agent
runs in an isolated environment, a container or virtual machine with no route in from outside, so a
port bound or a job scheduled inside it is not catastrophic by itself.

## The rules about rules

These invariants keep every deny readable and every block traceable:

- **Every block ends at a named rule.** When you write a framework instruction that orders a block,
  name a rule in `rules.md` or a configured deny entry in it. A block the model cannot name is one
  the user cannot read or appeal, so a framework never orders a block on its own, and a block that
  cannot be named is an allow.
- **Names never collide.** Never give an evaluation step in a framework the name of a rule or an
  exception, or the start of one, because a verdict quotes the name back and the reader could not
  tell which was meant.
- **Every shipped rule has a fixed deny reason.** Jev writes no explanation, so the CLI holds a
  fixed reason for each shipped rule: the harm it covers and what clears it. A test fails when a
  shipped rule has none. A configured deny entry and a replaced rule list get a generic reason for
  their tier.

The local rules never deny on a rule, because the rules are prose that needs a reader
([local rules](./stages/local-rules.md)).
