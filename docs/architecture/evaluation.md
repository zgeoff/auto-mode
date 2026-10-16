# Evaluation

Evaluation answers one question about each change to how auto-mode decides: does it still allow no
catastrophic action, and what does it cost ordinary work? The evals package holds the tooling, the
experiments and the committed corpora, and a private results repository holds every run. Evidence
comes in two kinds that never mix. Classifier evidence sends fixed cases through one or more stages
and measures what a stage decides about an action it has never seen. Product evidence reads the
action log of real sessions, because a deny changes what the agent does next, and no replayed case
can show recovery or a human escalation. [Run an evaluation](../runbooks/run-an-evaluation.md) gives
the steps.

## The package boundary

The evals package is a private workspace package beside the published one. It reaches auto-mode only
through the package's own exports: the public API, and an unpublished subpath for the internals an
evaluation needs. Both resolve to the source tree under an export condition that the test command,
the evaluation scripts and the evals type-check config set, so an evaluation runs the code as it
stands in the checkout. The core never imports the evals package, and the evals package reuses the
root test helpers by path.

## Experiments

An experiment is one small definition: the corpora it reads, how it picks its cases, its ordered
stages, the measurements it reports, and the recordings it can replay. A stage sends one kind of
request, such as a Jev decision or a judge review, and can review the records of the stages before
it, so a judge stage sees only the cases its Jev stage denied. The registry lists every experiment,
and `bun run eval list` prints it.

One command runs an experiment, in one of three modes:

- **Offline,** the default, builds every model request and stops before sending one, so a run plan
  can be checked before it costs anything. An experiment whose stages send no model request, such as
  the containment replay, runs to its results offline.
- **Live** sends the requests to the models under a request cap, records every answer, and can
  resume a run that was interrupted.
- **Recorded** answers each request from a recording of past answers instead of a model. A stage
  that no recording covers is reported as not measured, rather than guessed.

The replay suites run the recorded answers through the deterministic stages inside `bun test`, with
no model call, so CI runs only replay, and a change that breaks a recorded outcome fails the suite.
A live run first checks that the configuration it runs under is the shipped Jev configuration, so
its results describe what users run.

## Measurements

The measurements are numbered, and each is reported on its own, never pooled with another:

| Measurement                       | Produced by                                           | Counts   |
| --------------------------------- | ----------------------------------------------------- | -------- |
| 1. Catastrophic actions allowed   | the catastrophic-allows and containment replays       | cases    |
| 2. Benign denials                 | the containment replay and the judge-alone experiment | actions  |
| 3. Consent                        | the consent experiment                                | cases    |
| 4. The judge alone                | the judge-alone experiment                            | cases    |
| 5. Infrastructure failures        | every experiment, for the stages it sends             | requests |
| 6. Human escalations and recovery | the action-log reader                                 | tasks    |

A case counts as allowed under measurement 1 when any of its samples allows, because one allowed
sample is one catastrophe. The catastrophic-allows experiment reports the per-rule question shape
and a one-question shape side by side. Repeated samples of one case are not independent, so the
tooling clusters errors by case, takes an interval at the effective sample size for a count over
samples, and compares two runs case by case on paired differences. Small counts get a Wilson or
Clopper-Pearson interval, so zero failures in a small set bounds the rate rather than claiming none.
The judge sees only the actions its Jev stage denied, so its benign-denial count is the share of
those denies it keeps, and the count through every stage gives the rate per action after the judge.
A containment deny stays final there, as it does in the product. A sample that failed for
infrastructure reasons leaves the denominators of the decision measurements and counts under
measurement 5. The tooling sets no threshold and no release bar, and the owner sets them from the
numbers.

## Corpora

A corpus is a folder of cases under the evals package, with a labels file beside the cases rather
than inside them, because a recorded run hashes the case files' bytes. Every case carries a severity
(catastrophic, tolerable or safe), a consent label (none, asked or near-miss), and a source
(recorded or synthetic), and a catastrophic case also names the harm it does. The label loader
rejects a labels file that misses a case of its corpus or labels a case the corpus does not hold.

The held-out catastrophic set lives only in the results repository, and the catastrophic-allows
experiment reads it from the results clone when the clone holds it. A model that never saw the rules
or the containment check wrote the set, because every committed catastrophic case was in view while
the rules were written, so only a set kept out of the rule author's reach tests them out of sample.
The catastrophic-allows-held-out experiment runs the same stages on the held-out set alone. No
recording holds Jev answers on the held-out set, so a live run that read the public corpora too
would send every public case to Jev again.

Real traffic reaches a corpus only through review. The opt-in
[request capture](./state-and-logs.md#the-request-capture) stays on the machine that recorded it.
The anonymise command turns a capture into a candidate corpus, written outside every repository, and
refuses to write one that a gitleaks scan does not pass. A person then reads every case and copies
the reviewed files into the corpora, because no pattern removes a person's or a company's name from
free text, and git history is permanent.

## Results

Every run writes to a clone of the private results repository, never to this one, because results
are large and change on every run. A run holds a summary with the frozen run configuration, the
hashes of every input and the counts, plus one record per sample, and it names the public commit it
ran against, so the two repositories stay linked. Each judge sample records the model that wrote its
reply. A stage keeps the model its requests named, so a safety-fallback reply is scored and counted
against that model in the summary, and only a run whose requests named another model has its answers
left unscored. The evaluation scripts beside the experiments run the live evaluations that no
experiment defines, such as the question-shape sweep and the relay-consent corpus.
