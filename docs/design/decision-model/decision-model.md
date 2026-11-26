# Decision model: the unbuilt parts

The decision model is the approved design for what each stage of auto-mode decides when it judges a
tool call: the local rules, the containment check, Jev and the judge. Most of it is built: for the
built stages, read [the architecture overview](../../architecture/overview.md). This design covers
only the part the code does not implement, for whoever builds it or sets a default from its results.
For the reasons, the evidence and the rejected alternatives, read the decision records: the
[decision model record](https://linear.app/zgeoff/document/geo-100-decision-record-auto-mode-decision-model-4c00fccbe287)
and the
[evaluation toolset record](https://linear.app/zgeoff/document/geo-88-decision-record-auto-mode-evaluation-toolset-eb866dbc021e).

## Benign denials on real traffic from more than one repository

[Evaluation](../../architecture/evaluation.md) defines six measurements. Measurement 2 counts benign
denials per action: the safe actions a stage denies. Measure it by replaying real traffic, recorded
in more than one repository, through every stage. The containment replay and the judge-alone
experiment already count it for each stage, but only on traffic recorded in one repository, so the
count across repositories is unbuilt.

To build it, record real traffic in more repositories with the request capture, turn it into corpora
as [Run an evaluation](../../runbooks/run-an-evaluation.md#anonymise-a-capture-into-a-corpus) says,
and replay those corpora through every stage.

- Set Jev's threshold, the denial budget defaults and any release bar from the measurements, and
  only once the measurement each depends on exists.
