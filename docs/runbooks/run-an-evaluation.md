# Run an evaluation

`bun run eval` runs one experiment from `evals/experiments/` and writes the run to the private
results repository. [Evaluation](../architecture/evaluation.md) explains what each measurement
means; this runbook covers the steps.

## Set up the results clone

1. Clone `zgeoff/auto-mode-evals` outside this repository.
2. Export `AUTO_MODE_EVALS_DIR` with the path of that clone, or pass `--results <dir>` on each run.
   The command refuses a run with neither, and refuses a directory inside this repository.

## List the experiments

```sh
bun run eval list
```

Each entry names its corpus, its stages, which stages ask the model, and its default sample count.

## Read the plan

```sh
bun run eval run <experiment>
```

The command prints the plan: cases, samples, stages, and the model requests the plan needs. When a
stage asks the model, the command stops there and sends nothing. Use `--samples <n>` and
`--seed <n>` to change the plan.

## Run offline

An experiment whose stages ask no model, such as a replay of recorded answers, runs in full without
`--live` and writes a run. It prints each count with its denominator and the run directory.

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

## Resume an interrupted run

```sh
bun run eval run <experiment> --live --max-requests <n> --resume <run-dir>
```

The resumed run skips every stage run its `samples.jsonl` already holds, and refuses a run whose
commit, hashes, seed or sample count differ. The cap applies to the requests still to send.

## Compare two runs

```sh
bun run eval compare <run-dir-a> <run-dir-b>
```

Both runs must be of one experiment. The output shows each count with its denominator and intervals,
the paired per-case difference over the cases both runs hold, and every config field that differs,
such as the policy, corpus or labels hash or the model.

## Commit the run

In the results clone, commit the new `runs/<experiment>/<run>/` directory and push it. Never commit
a run, or any part of one, to this repository.

## Reproduce a legacy summary

The reports from before this command live under `legacy/` in the results repository and never
change. To check one, copy it to a scratch directory, run its runner's `--summarize` on the copy
(`bun run eval:relay-consent --summarize <copy>`), format the copy with oxfmt, and compare its
SHA-256 with the line in `MANIFEST.sha256`.
