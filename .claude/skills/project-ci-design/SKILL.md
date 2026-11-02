---
name: project-ci-design
description:
  "auto-mode's test budget and required checks, and how its two callers of bun-checks.yml take a new
  check. Load it beside ci-design before you add or change a workflow, a job or a step in auto-mode."
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

None.

## Adding a check

- Add a check as a package script, and add its name to the `BUN_CHECK_SCRIPTS` repo variable, as the
  Jobs section of [ci-design](../ci-design/SKILL.md) says. Both
  [`pr.yml`](../../../.github/workflows/pr.yml) and
  [`main.yml`](../../../.github/workflows/main.yml) pass that variable to `bun-checks.yml`, so the
  script runs on each pull request and each push to `main`. Read the current list with
  `gh variable get BUN_CHECK_SCRIPTS -R zgeoff/auto-mode`.
- When a test runs a tool that the runner image lacks, turn on the matching `setup-*` input of
  `bun-checks.yml` in both callers, as `setup-gitleaks` is for the gitleaks scan in
  `e2e/package-install.test.ts`.
