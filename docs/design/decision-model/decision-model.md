# Decision model: the unbuilt parts

The decision model is the approved design for what each stage of auto-mode decides. Most of it is
built, and [the architecture overview](../../architecture/overview.md) describes the built stages.
This design holds only the parts the code does not implement. The decision records hold the reasons,
the evidence and the rejected alternatives: the
[decision model record](https://linear.app/zgeoff/document/geo-100-decision-record-auto-mode-decision-model-4c00fccbe287)
and the
[evaluation toolset record](https://linear.app/zgeoff/document/geo-88-decision-record-auto-mode-evaluation-toolset-eb866dbc021e).

## Benign denials on real traffic from more than one repository

Measurement 2 counts benign denials per action, and the design takes it from a replay of recorded
real traffic from more than one repository, through every stage. The containment replay and the
judge-alone experiment produce it for every stage, but the recorded real traffic comes from one
repository, so the count across repositories is unbuilt. Jev's threshold, the denial budget defaults
and any release bar are set from the measurements once each one exists.
