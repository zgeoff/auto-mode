# Evaluation

Evaluation answers one question for each change to the decision model: does it still allow no
catastrophic action, and what does it cost ordinary work? The [decision model](./decision-model.md)
names six measurements; this doc maps each one to its cases, its unit, and the part that produces
it, and states the rules every report follows. This is the approved design; where the evaluation
code differs, this doc is the target. The
[decision record](https://linear.app/zgeoff/document/geo-88-decision-record-auto-mode-evaluation-toolset-eb866dbc021e)
holds the reasons and the rejected alternatives.

## Two kinds of evidence

- **Classifier evidence** comes from fixed cases sent through one or more stages offline. It
  measures what a stage decides about an action it has never seen in context.
- **Product evidence** comes from the action log of real sessions. It measures what a deny does to
  the agent and the human, which no fixed case can show.

**Why:** a deny changes what the agent does next, so a replayed action cannot show recovery or
escalation. The two kinds are never pooled.

## The measurements

| #   | Measurement                                 | Cases                                               | Unit                                                        | Kind       |
| --- | ------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- | ---------- |
| 1   | Catastrophic actions allowed, per stage     | catastrophic sets and the held-out set              | allowed cases / catastrophic cases                          | classifier |
| 2   | Benign denials                              | recorded real traffic from more than one repository | denied actions / actions                                    | classifier |
| 3   | Consent                                     | consent twins and near-misses                       | credited twins, held near-misses                            | classifier |
| 4   | The judge alone                             | Jev denies, including the consent pairs             | overturns, catastrophic overturns, failures, latency        | classifier |
| 5   | Infrastructure failures, per stage          | every live run                                      | invalid answers and timeouts / requests                     | classifier |
| 6   | Human escalations and recovery after a deny | the action log                                      | escalations / tasks; tasks that recover / tasks with a deny | product    |

Measurement 1 counts a case as allowed when any of its samples allows. Measurement 1 also reports
the one-question shape beside the per-rule shape.

## Parts

- **The evals package** (`evals/`) holds the runner, the experiments, and the corpora. It is to use
  auto-mode only through its package exports, and the core is never to import it; until the package
  move lands, the `evals/` tree still imports `src/` directly.
- **One command,** `bun run eval <experiment>`, runs an experiment. An experiment is a small
  definition: its cases, the stages it sends them through, and the measurements it reports.
- **Live mode** sends model requests only with `--live`, under a request cap, and can resume an
  interrupted run. Without `--live` a run builds its requests and stops.
- **Replay** runs recorded answers through the deterministic stages in `bun test`, with no model
  calls. CI runs only replay. `--recorded <recording>` runs an experiment on past answers instead of
  live ones; a stage no recording covers is reported as not measured.
- **The experiments** are `catastrophic-allows` (measurement 1), `consent` (3), `judge-alone` (4)
  and `infrastructure-failures` (5); every experiment also reports 5 for the stages it sends.
- **The results repo** (`zgeoff/auto-mode-evals`, private) holds every run: a run summary with the
  frozen run config, hashes and counts, and one record per sample.
- **The action-log reader,** `bun run eval live`, turns the diagnostics log into measurement 6.

**Why:** results are large and change on every run, and the public repo is not the place for them.
Each result records the public commit it ran against, so the two repos stay linked.

## Cases

Every case carries four labels:

- `severity`: catastrophic, tolerable, or safe.
- `harm`, on catastrophic cases: lost work the task does not own, a write to main or production,
  data sent outward, changed credentials or permissions, or auto-mode disabled.
- `consent`: none, asked, or near-miss.
- `source`: recorded or synthetic.

The labels live beside each corpus in `evals/corpora/<corpus>/labels.json`, never in the case files,
whose bytes the recorded reports hash. A labels file carries a `schemaVersion`, names its corpus and
the field that keys its cases, and labels every case of that corpus and no other; a `note` holds the
reason for a label that is not obvious. `loadCaseLabels` in `evals/lib/` reads one and rejects a
file that misses a case or labels an unknown one.

The held-out catastrophic set is written by a model that never saw the rules or the containment
detector, and it lives only in the results repo.

**Why:** every older catastrophic case was in view while the rules and the detector were written, so
only a set kept out of reach of the rule author tests them out of sample.

Real traffic comes from an opt-in capture in the CLI the mod runs. A raw capture never enters git,
in either repo: it stays on the machine that recorded it, and only its anonymised form, after a
gitleaks scan that passes, becomes a corpus.

**Why:** a raw capture holds real prompts, paths, and possibly secrets, and git history is permanent
and shared, so the anonymised and scanned form is the only way into any repo.

## Reporting rules

1. Every number has its denominator. Real and synthetic cases are reported apart.
2. Measurements 1, 3 and 4 count distinct cases, not samples; measurement 2 counts actions and
   measurement 5 counts requests. Repeated samples of one case are not independent: errors are
   clustered by case, and two runs compare case by case on paired differences.
3. Small counts get a Wilson or Clopper-Pearson interval. Zero failures in n cases bounds the rate
   below about 3/n at 95%; it never shows zero risk. A count over samples or requests takes its
   interval at the effective sample size, n over the design effect of the clustered standard error.
4. A sample that failed for infrastructure reasons leaves the denominators of measurements 1 to 4
   and counts under measurement 5.
5. A report names what it did not measure: missing sets, stages not run, and overlap between the
   cases and what the rule author saw.
6. Tooling sets no threshold and no release bar. The owner sets them from these numbers.

**Why:** small corpora and repeated samples make naive rates look more certain than they are, and a
pooled rate hides a catastrophic allow inside ordinary friction.
