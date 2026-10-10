# Run an evaluation

`bun run eval` runs one experiment from `evals/experiments/` and writes the run to the private
results repository. [Evaluation](../architecture/evaluation.md) explains what each measurement
means; this runbook covers the steps.

## Set up the results clone

1. Clone `zgeoff/auto-mode-evals` outside this repository.
2. Export `AUTO_MODE_EVALS_DIR` with the path of that clone, or pass `--results <dir>` on each run.
   The command refuses a run with neither. It resolves the path through any symlink and refuses a
   directory inside this repository, a directory that is not the root of a git clone, and a clone
   that is not of `zgeoff/auto-mode-evals`: its `origin` must name that repository, or its root must
   hold the results `README.md` and `MANIFEST.sha256`. `--resume` takes a run directory inside that
   clone.

## List the experiments

```sh
bun run eval list
```

Each entry names its corpora, its stages, which stages ask the model, and its default sample count,
then one line for each recording it can replay.

| Experiment                | Measurement                                                             |
| ------------------------- | ----------------------------------------------------------------------- |
| `catastrophic-allows`     | 1: catastrophic cases allowed per stage and by harm, both Jev shapes    |
| `consent`                 | 3: twins credited and near-misses held, with GEO-78 control-11 and -39  |
| `judge-alone`             | 4: the judge on Jev denies: overturns, catastrophic overturns, failures |
| `infrastructure-failures` | 5: failed and unreadable requests per stage, the judge on every sample  |
| `containment-replay`      | 1 and 2 for the containment check over the recorded Jev answers         |

Every experiment also reports measurement 5 for the stages it sends.

## Read the plan

```sh
bun run eval run <experiment>
```

The command prints the plan: cases, samples, stages, and the model requests each stage needs. A
stage that reviews another stage's denies, such as the judge, sends at most one request per deny, so
its line is an upper bound. When a stage asks the model, the command stops there and sends nothing.
Use `--samples <n>` and `--seed <n>` to change the plan.

## Run offline

An experiment whose stages ask no model, such as a replay of recorded answers, runs in full without
`--live` and writes a run. It prints each count with its denominator and the run directory.

## Replay a recording

```sh
bun run eval run <experiment> --recorded <recording>
```

A recording is a set of past model answers, named in `bun run eval list`. Each stage that sends
replays the recorded answer for its case and sample, with the recording's latency and model; a stage
the recording holds no answers for is left out and named as not measured. A recording kept under
`legacy/` in the results clone is read from there; without it, that stage is not measured either.
`--recorded` and `--live` cannot be combined. The run records each answer's hash beside its request
hash, and whether the tree was dirty, so an offline run from a dirty tree still says so.

## Run live

A live run spends money on model requests, so get the owner's approval for the request count first.

1. Commit every change to the source, the corpora and the experiments; a live run refuses a dirty
   tree, because the run records the commit it ran against.
2. Run with a cap at or above the planned request count:

   ```sh
   bun run eval run <experiment> --live --max-requests <n>
   ```

   The command refuses a plan larger than the cap, and stops a run that would send one more.

A request that times out, fails, or returns an invalid answer is recorded as not scorable with its
reason. It leaves the other measurements' denominators and counts under the infrastructure failures.

## Read the counts

Each count carries its denominator, a Wilson and a Clopper-Pearson interval, and the rule-of-three
bound when it is zero. A count over samples or requests, where one case contributes several, also
carries the clustered standard error and its design effect: the intervals use the effective sample
size, n divided by the design effect, so they are wider than a naive interval over the same samples.
Where the rate is 0 or 1 the design effect is the mean samples per case, so each case counts once.
An all-stages count from a recording that left a stage out names that stage, as in
`all-stages without judge`. The output lists what the run did not measure: a missing held-out set, a
stage without recorded answers. A required case, such as the consent controls, is listed by key with
each stage's verdict on every sample.

## Resume an interrupted run

```sh
bun run eval run <experiment> --live --max-requests <n> --resume <run-dir>
```

The resumed run skips every stage run its `samples.jsonl` already holds, and refuses a run whose
commit, hashes, seed or sample count differ. The cap applies to the requests still to send. A run
interrupted mid-write can leave a torn last line; the resume drops it, prints how many characters it
dropped, and runs that stage again. A run started from a dirty tree cannot be resumed, because no
commit names its code.

## Compare two runs

```sh
bun run eval compare <run-dir-a> <run-dir-b>
```

Both runs must be of one experiment. The output shows each count with its denominator and intervals,
the paired per-case difference over the cases both runs hold, and every config field that differs,
such as the policy, corpus or labels hash or the model.

## Measure live use

```sh
bun run eval live [--log <path>] [--since <iso-time>] [--results <dir>]
```

`live` reads the [action log](../guides/diagnostics.md) and reports measurement 6. Without `--log`
it reads the path the CLI writes: `AUTO_MODE_DIAGNOSTICS_PATH`, or
`$XDG_STATE_HOME/auto-mode/actions.jsonl`, or `~/.local/state/auto-mode/actions.jsonl`. `--since`
takes an ISO 8601 time with an offset, or a date, and leaves out the records written before it. It
reads version 3 records; it counts and skips records of any other version and lines that are not
JSON, such as a torn append, and fails on a version 3 record of the wrong shape.

A task is one session. The record holds no agent identifier, so a subagent's actions count with the
session that spawned it, though the denial budget counts a subagent apart. The command prints:

- escalations per task: tasks with an escalation out of tasks, and every escalation over tasks;
- tasks that recover after a deny: a task recovers when an action is allowed after its first deny
  and before any escalation, out of the tasks with a deny;
- denials per action for each deciding stage, over every action, clustered by task; an escalated
  action reached the user rather than the agent, so it is not a denial;
- the records, the started records with no final record, the tasks, and the time span.

The run goes to `runs/live-use/<run>/summary.json` in the results clone, with the public commit,
whether the tree was dirty, and the SHA-256 of the log bytes it read. It holds only counts and the
hashed session identifiers the log already holds: never a log line or the log path.

## Anonymise a capture into a corpus

```sh
bun run eval anonymise <capture.jsonl...> --out <dir>
```

[Turn the capture on](../guides/configuration.md#capture) to record real traffic, then build a
candidate corpus from its files. The raw capture stays on the machine that recorded it; only the
output of this command may enter a repository.

1. Run the command over one or more capture files. It replaces user names, home paths, hosts,
   emails, repository owners and names, branch names, session and tool-use identifiers, and tokens
   with placeholders such as `user-3f9a01c2`. One run maps a value to one placeholder; the key comes
   from a random salt that is never written, so two runs cannot be joined. The tool, the command
   structure and the path structure stay as recorded, and so do `main` and a loopback host.
2. The command writes `cases.json` and `labels.todo.json` to a private temp directory and scans it
   with `gitleaks dir` and its default rules; `gitleaks` must be on `PATH`. A finding, or a scan
   that cannot run, deletes the temp directory and writes nothing. Only a passing scan copies the
   files to `--out`.
3. `--out` must not exist, and its parent must. It may sit outside every git work tree, or under
   `evals/corpora/` of this repository; the command refuses any other directory inside a work tree.
4. Every case is `source: recorded`. `labels.todo.json` lists the case keys with that label alone,
   because a case's severity, harm and consent need a reader. Label each one and save the file as
   `labels.json` in the [labels format](../architecture/evaluation.md#cases).
5. Read every case before you commit it. The placeholders cover the forms above and the bundled
   secret rules, not every way a prompt can name a person or a project.

## Commit the run

In the results clone, commit the new `runs/<experiment>/<run>/` or `runs/live-use/<run>/` directory
and push it. Never commit a run, or any part of one, to this repository.

## Reproduce a legacy summary

The reports from before this command live under `legacy/` in the results repository and never
change. To check one, copy it to a scratch directory, run its runner's `--summarize` on the copy
(`bun run eval:relay-consent --summarize <copy>`), format the copy with oxfmt, and compare its
SHA-256 with the line in `MANIFEST.sha256`.
