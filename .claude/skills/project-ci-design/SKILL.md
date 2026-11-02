---
name: project-ci-design
description:
  "auto-mode's test budget and required checks, and the ci-design rule it replaces: auto-mode runs
  its own one-job checks workflow in place of bun-checks.yml. Load it beside ci-design before you
  add or change a workflow, a job or a step in auto-mode."
metadata:
  kind: rule-set
---

# auto-mode CI design

## Facts

| Fact            | Where                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| Test budget     | 1 min                                                                                  |
| Required checks | `gh api repos/zgeoff/auto-mode/rules/branches/main`, the `required_status_checks` rule |

## Departures

- Run CI from auto-mode's own [`checks.yml`](../../../.github/workflows/checks.yml): one `checks`
  job that runs every check as a step. The "Jobs" section of [ci-design](../ci-design/SKILL.md)
  calls zgeoff/tools' `bun-checks.yml` instead. `checks.yml` predates `bun-checks.yml`, and the repo
  hasn't switched to it since. Ask the repo owner before you switch it.

## Adding a check

- Add a check as a step of the `checks` job in `checks.yml`.
  [`pr.yml`](../../../.github/workflows/pr.yml) and
  [`main.yml`](../../../.github/workflows/main.yml) both call `checks.yml`, so the step runs on each
  pull request and each push to `main`. The ruleset requires that job as `checks / checks`, the
  caller's job name and then the called job's, so never rename either job.
- Give a check that comments on a pull request a job of its own in `pr.yml`, as `gitleaks` has. Such
  a check needs write access to pull requests, and the `checks` job has none.
