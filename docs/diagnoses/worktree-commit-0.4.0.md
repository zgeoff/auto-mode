# Worktree commit approval in 0.4.0

The GLM session `frankie-glm-imp-launch` requested a routine commit at 2026-10-04 14:40:57 UTC. The
action staged three named source/test files, created a commit, and printed two log entries. The
session task explicitly asked for preserved diagnostics work, regressions, and a draft PR in
`.worktrees/fix-281-refusal-detail`.

## Historical evidence

The transcript records tool call `call_1dcc54fde4634c3092cd77dc`. The original classifier outcome
was not recorded. Manual approval alone cannot distinguish a classifier ask, missing credentials, a
failed subprocess, or a timeout. The later tool result records completion after manual approval; the
diagnosis did not execute that command.

ATC selects the released Claude mod. The mod calls `auto-mode run --jev-only` through
`$.process.run`. The CLI discovers the operator's auto-mode config and resolves its key through
`apiKeyCommand`; an absent Jev environment variable is expected. Independent checks of both live GLM
and Muse environments confirmed helper resolution. No credential change is needed. The current CLI
launcher points to a prior checkout, so the reproduction explicitly loaded the installed 0.4.0
policy. Current config and imported rules cannot prove their historical bytes.

## Classification-only reproduction

Two probes used the exact tool input and working directory, the installed 0.4.0 policy, current
imported rules, and the direct user prompt before the target call. The reconstructed main-agent task
context retained that prompt as both the original task and latest direct user evidence. The
transcript contains no captured mod request, so that context is a reconstruction.

Both returned `ask` at the unchanged 0.8 threshold, in 492 ms and 413 ms. Every selected answer was
`allow`; uncertainty caused the combined ask.

| Rule                 | Probe 1 confidence / allow probability | Probe 2 confidence / allow probability |
| -------------------- | -------------------------------------- | -------------------------------------- |
| Default Branch Write | 0.29 / 0.52                            | 0.36 / 0.57                            |
| Secret Persistence   | 0.77 / 0.85                            | 0.79 / 0.86                            |
| Data Exfiltration    | 0.74 / 0.83                            | Passed threshold                       |

Default Branch Write was the largest repeated uncertainty. The request carried a worktree path but
no checked branch reference. The source-file contents were also absent. These results explain the
reproduced ask; they do not establish the original event's outcome.
