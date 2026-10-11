# The denial budget

The denial budget is the only path from a deny to a human. The classifiers never ask the user
anything: every stage answers allow or deny, and a denied agent is told to find a safer path. An
agent that cannot find one would loop on denies forever, so the budget counts them, and once an
agent has used its denials, the next deny becomes no verdict. The mod then keeps the prompt Claude
Code was about to show, and the user decides that call. The budget also stops an agent from asking
again until a model happens to allow: a repeat of the action just denied gets the same deny without
any model call.

Every verdict passes through the budget before the CLI writes it, whichever stage gave it, so a
containment deny counts the same as a Jev deny.

## Two counts and a remembered deny

The budget keeps three things for each agent of a session, the main agent and every subagent alike:
the consecutive count of denies, the session count, which counts that agent's denies across the
whole session, and the last deny with the key of the action it denied. They live in one file per
session and agent in the state directory, so they survive a reload of the mod and a resumed session,
which keeps the same session identity.

| Verdict          | Consecutive count | Session count | Remembered deny | The CLI writes         |
| ---------------- | ----------------- | ------------- | --------------- | ---------------------- |
| allow            | reset             | kept          | cleared         | the allow              |
| deny             | one more          | one more      | this deny       | the deny, with a count |
| deny, budget out | reset             | reset         | cleared         | no verdict             |
| no verdict       | kept              | kept          | kept            | no verdict             |

A deny spends the budget once either count has reached its configured limit, so the call that would
pass a limit is the one the user sees. Both counts restart from zero at that point. The CLI never
sees the user's answer to the prompt, but the next request for that agent can only arrive after the
user answers, so the restart is safe. A call that ends in no verdict for any other reason, such as a
classifier failure under the default failure response, leaves the budget as it was.

Each deny reason ends with the number of denials left before auto-mode asks the user. The last deny
before a limit instead tells the agent to stop and report what consent it needs.

## Repeats of the action just denied

Before any stage runs, the CLI computes a retry key for the call and compares it with the remembered
deny. A match gets the remembered rule and reason again, with no model call, and counts as a deny.
The key covers the current directory, the tool, the tool's input without the fields that describe a
Bash call without changing it, such as its description and timeout, and the text and freshness of
the user's last message. A new message from the user is new evidence, so it gives a new key, and the
classifiers see the action again.

## Crashes and races

The CLI writes the budget file before it writes the verdict to stdout. A CLI killed between the two
leaves a counted deny that the agent never received, and the user sees the prompt, because the mod
got no verdict. The agent's next attempt at the same action is then a repeat, and gets the
remembered deny, even when the user approved the prompt in between, because the CLI never sees that
answer. The CLI writes the file to a temporary name and renames it into place, so a crash mid-write
leaves the old counts whole, never a torn file. A file that cannot be read or parsed counts as
empty, and a file that cannot be locked or written costs the counts, not the verdict: the CLI writes
a note to stderr and still writes its verdict.

Claude Code can check two calls of one agent at once, and each CLI reads the counts, classifies, and
writes the counts back. The CLI therefore reads the counts again under a lock file beside the budget
file once the classifier returns, plans the budget from that read, and writes the result before it
releases the lock, so a parallel call waits for the lock instead of losing its count. The classifier
runs outside the lock, because it can take seconds and the lock wait is bounded. A call that cannot
take the lock in time plans from a read without the lock, and its count can be lost, which delays
the budget's stop by one deny.
