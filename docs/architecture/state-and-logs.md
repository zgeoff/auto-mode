# State and logs

Each CLI run ends with its call, so everything auto-mode remembers lives in files in its state
directory: the denial counts, the session scope, the action log and the opt-in capture. The judge
server holds a warm judge process and no state that a decision reads, and it listens on a socket in
the user's runtime directory, or under the state directory when the host sets none. Each CLI run
reads what it needs, writes what changed, and exits. The files are private to the user, so the CLI
creates them readable by the owner alone. The capture alone refuses a directory inside a git work
tree, because it is the one file that holds the work itself. The state directory sits under the XDG
state home, and the [configuration guide](../guides/configuration.md) gives the paths.

## The files

| File            | Written by                | Keyed by               | Write                     |
| --------------- | ------------------------- | ---------------------- | ------------------------- |
| denial counts   | every judged call         | session and agent      | under a lock, then rename |
| session scope   | the record command        | session                | under a lock, then rename |
| action log      | every judged call         | none: one shared file  | appended line             |
| request capture | every judged call, opt-in | none: one file per day | appended line             |

The CLI names each keyed file by a hash of the session identity, never the identity as written. The
[denial budget](./stages/denial-budget.md) owns what its file holds, and
[the task scope](./evidence/task-scope.md#what-the-session-created) owns the session scope file.

## The action log

The action log holds one line when a judged call starts and one when it ends, so a call whose CLI
died midway shows as a start with no end. The end line holds the verdict, the deciding stage, the
denial counts, whether the call spent the budget, and each model stage's own diagnostics: Jev's
status, the step where it failed, the request size, its latency and every rule that reached the
threshold, and the judge's outcome and latency. It keys a call by hashes of its session, agent and
tool-call identifiers, and it holds no message text, so the log records how auto-mode decided
without holding the work it decided about. One exception: an end line that holds a judge review also
holds the reviewed action, its tool, working directory and input, with every secret the secret rules
find replaced, so a held deny can be tied to the command it held.
[Action diagnostics](../guides/diagnostics.md) lists the fields, and the evaluation tooling turns
the log into its live-use measurement ([evaluation](./evaluation.md)).

Two processes can append to the log at once without a lock, because each appends one whole line. A
failed append writes a warning to stderr and never changes the verdict.

## The request capture

The capture is off by default. When the configuration turns it on, every judged call appends its
full request, with the verdict and the deciding stage, to a file per day. A capture holds real
prompts, paths and commands, and possibly secrets, so the CLI refuses to write one inside a git work
tree, checking the directory both as configured and as its links resolve, and refuses a relative
directory. It creates the directory readable by the owner alone with a `.gitignore` that ignores
everything, and appends without following a link. A refused or failed capture writes a note to
stderr and never changes the verdict. A capture becomes a corpus only through the anonymising step
and a person's review ([evaluation](./evaluation.md#corpora)).

## What survives a crash

Every write that a later call depends on either replaces a file whole by a rename or appends a whole
line, so a CLI killed at any point leaves each file as it was before the write or as it is after it,
never torn. What a crash costs follows from the order of the writes:

- A CLI killed before it writes a verdict costs the user one prompt, because the mod keeps the
  prompt on a missing verdict.
- A CLI killed between the budget write and the verdict leaves a counted deny the agent never saw,
  and the agent's next try at the same action gets that deny again
  ([crashes and races](./stages/denial-budget.md#crashes-and-races)).
- A CLI killed while holding the lock on the denial counts or the session scope leaves a lock that
  the next update of that file takes over once it is stale. The update renames its own lock over the
  stale one, so the lock path never stands empty for a second update to claim, and a CLI removes a
  lock only when the lock holds its own owner id.
- A file that a later read cannot parse counts as empty: no denials so far, or no scope the session
  created.
