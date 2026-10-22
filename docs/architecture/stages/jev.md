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

A commit or push that turns off the repository's hooks, or some of their steps, gets guidance of its
own. The hooks check what an agent commits and pushes, so turning them off disables a guard on the
agent, and the Policy Tampering text names only the hook that installs auto-mode. The guidance
covers git commit, git push, and each gh stack command that commits or pushes. It applies when
lefthook or husky is switched off, or lefthook is told to leave steps out, by a variable set before
the command or exported earlier in it, or when git's no-verify option is set. The Policy Tampering
question then names each switch and asks Jev to judge the call under that rule. It names a switch by
a fixed label, never by the command's own text, because the question is trusted instruction and the
agent under review writes the command.

A command that replaces the repository's hooks gets the same guidance. It applies in three cases:

- A variable points lefthook at a config other than the one the worktree loads, or at a binary other
  than lefthook on the path or the one the worktree's packages install.
- A git config option, or a variable that git reads config from, points git at a hooks folder other
  than the repository's. The variables are the only way to change the hooks folder of a gh stack
  command.
- A variable swaps the system or the user's git config for another file, or skips the system config,
  and leaves git with a hooks folder other than the repository's. The repository's own config still
  wins over both.

To tell the repository's own hooks from others, the Jev stage reads the checkout: the hooks folder
that the system, user and repository git config files set, with the files they include, resolved as
git resolves it; the hooks folder each git config file the command names sets; and the first
lefthook config at the worktree root. A path that names those exactly keeps the hooks and adds
nothing. Any other path counts as a replacement. Every path counts when the checkout is unknown,
when a conditional include or a worktree's own config may set the hooks folder, when the config
files and their includes take more reads or bytes than one call's read budget, or when the command
may leave the checkout, through a directory change or a git directory override. Every path also
counts when an unquoted variable or substitution sits among git's options, because the shell can
split it into several words that end git's options early and move a later config option into the
subcommand's arguments. An empty hooks folder runs no hooks, so it counts too.

A skip or exclude setting in lefthook's local config leaves steps out of every later commit and
push, so a write that adds one gets the same guidance, whether a file tool or a shell redirection
makes it. No earlier stage allows these calls: the local rules never allow a commit, a push or a
shell write, containment passes an in-scope one on, and the edit bypass sends every hook file to
Jev.

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

The rule the judge reviews is not always the rule the deny holds. A hard rule never clears on
consent, so when any hard rule blocks, the judge reviews that hard rule, even if a soft rule ranks
above it. Reviewing the soft rule instead would let consent in the user's message clear an action
that a hard rule also blocks. Once the judge has reviewed a deny, the deny holds the reviewed rule
and its reason, whichever rule ranked first.

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
