# auto-mode documentation

auto-mode answers the permission prompts Claude Code would show, through a Claude Code mod that runs
the auto-mode CLI for each prompted call. The [root README](../README.md) covers install and
everyday use.

## Architecture

- [Overview](./architecture/overview.md): the path of a prompted call, the topology, the files
  auto-mode keeps, and the rules that hold across every stage.
- [The mod](./architecture/mod.md): what the mod keeps in memory, when it keeps the prompt, and the
  contract it shares with the CLI.
- [The policy](./architecture/policy.md): the rule list, the framework each model reads, and the
  rules every block rule follows.
- [State and logs](./architecture/state-and-logs.md): the state directory, the action log, the
  opt-in capture, and what survives a crash.
- [Evaluation](./architecture/evaluation.md): the evals package, its experiments and measurements,
  the corpora, and the results repository.

### The stages

- [Local rules](./architecture/stages/local-rules.md): the deterministic allows for reads and
  regenerable output.
- [Containment](./architecture/stages/containment.md): the deny for a write outside the task scope.
- [The edit bypass](./architecture/stages/edit-bypass.md): the allow for an in-scope file edit, and
  its secret scan.
- [Jev](./architecture/stages/jev.md): the typed questions, the threshold, and what a classifier
  failure does.
- [The judge](./architecture/stages/judge.md): the review of every Jev deny, and when an overturn
  holds.
- [The denial budget](./architecture/stages/denial-budget.md): the counts, the retry of a denied
  action, and the hand-off to the user.

### The evidence

- [The task scope](./architecture/evidence/task-scope.md): the scope sources, and how a session's
  own worktrees, branches and pull requests are recorded.
- [The user message](./architecture/evidence/user-message.md): the task context, stale messages, and
  what consent can clear.
- [Settings and repository facts](./architecture/evidence/settings-and-repository.md): the user's
  own rules, the repository facts, and the MCP servers.

## Guides

- [Configuration](./guides/configuration.md): every `config.json` field, the provider presets, and
  how the API key is found.
- [Claude permission mod](./guides/claude-mod.md): the request and verdict, the time limits, and a
  reversible session trial.
- [Suggested allowlists](./guides/allowlists.md): `permissions.allow` against `autoMode.allow`,
  which entries bypass auto-mode, and how to write exclusions.
- [Writing a policy](./guides/policy.md): the rule tiers, the consent bar, and how to change or
  replace the shipped rules.
- [Action diagnostics](./guides/diagnostics.md): where the action log lives and the fields of each
  record.

## Runbooks

- [Run an evaluation](./runbooks/run-an-evaluation.md): the results clone, the plan, offline and
  capped live runs, resume, compare, and committing a run.

## Design

- [Decision model](./design/decision-model/decision-model.md): the parts of the approved decision
  model that the code does not implement.

## The policy itself

- [`policy/rules.md`](../policy/rules.md): what is blocked.
- [`policy/decision.md`](../policy/decision.md): the framework Jev reads.
- [`policy/judge.md`](../policy/judge.md): the framework the judge reads.
