# The denial budget

The denial budget is the only part of auto-mode that turns a deny into a prompt for the user. Jev
and the judge never ask the user anything: each answers allow or deny, and a denied agent is told to
find a safer path. An agent that cannot find a safer path would loop on denies forever, so the
budget counts them, and once an agent has used its denials, the next deny becomes no verdict. The
mod then keeps the prompt Claude Code was about to show, and the user decides that call. The budget
also stops an agent from asking again until a model happens to allow: a repeat of the action just
denied gets the same deny without any model call. For where the budget sits at both ends of the
path, see the [overview](../overview.md). For the state directory that holds its files, see
[state and logs](../state-and-logs.md).

Every verdict passes through the budget before the CLI writes it, whichever stage gave it, so a
containment deny counts the same as a Jev deny.

## Two counts and a remembered deny

For each agent of a session, the main agent and every subagent alike, the budget keeps the
consecutive count of denies, the session count, and the last deny with the key of the action it
denied. The session count counts that agent's denies, consecutive or not, since the budget last ran
out. They live in one file per session and agent in the state directory, so they survive a reload of
the mod and a resumed session, which keeps the same session identity.

| Verdict          | Consecutive count | Session count | Remembered deny | The CLI writes         |
| ---------------- | ----------------- | ------------- | --------------- | ---------------------- |
| allow            | reset             | kept          | cleared         | the allow              |
| deny             | one more          | one more      | this deny       | the deny, with a count |
| deny, budget out | reset             | reset         | cleared         | no verdict             |
| no verdict       | kept              | kept          | kept            | no verdict             |

A deny spends the budget once either count has reached its configured limit, so the call that would
pass a limit is the one the user sees. Both counts restart from zero at that point, because the CLI
never sees the user's answer to the prompt and has no later moment to restart them. A call whose CLI
writes no verdict for any other reason, such as a classifier failure under the default failure
response, leaves the budget as it was. A CLI killed mid-run is the exception
([crashes and races](#crashes-and-races)).

Each deny reason ends with the number of denials left before auto-mode asks the user. The last deny
before a limit instead tells the agent to stop and report what consent it needs.

## Repeats of the action just denied

Before any stage runs, the CLI computes a retry key for the call and compares it with the remembered
deny. A match gets the remembered rule and reason again, with no model call, and counts as a deny.
The key covers the current directory, the tool, the tool's input, and the text and freshness of the
user's last message. It leaves out the input fields that describe a Bash call without changing it,
such as its description and timeout. A new message from the user is new evidence, so it gives a new
key, and the classifiers see the action again.

## Crashes and races

The CLI writes the budget file before it writes the verdict to stdout. A CLI killed between the two
leaves a counted deny that the agent never received, and the user sees the prompt, because the mod
got no verdict. The agent's next attempt at the same action is then a repeat, and gets the
remembered deny, even when the user approved the prompt in between, because the CLI never sees that
answer. The CLI writes the file to a temporary name and renames it into place, so a crash mid-write
leaves the old counts whole, never a torn file. A file that cannot be read or parsed counts as
empty. When the CLI cannot lock or write the file, it loses the counts, writes a note to stderr, and
still writes its verdict.

Claude Code can check two calls of one agent at once. Each CLI reads the counts, classifies, and
writes the counts back, so one call can overwrite the other's count. To prevent that, the CLI reads
the counts again under a lock file beside the budget file once the classifier returns, plans the
budget from that read, and writes the result before it releases the lock. A parallel call waits for
the lock. The classifier runs outside the lock, because it can take seconds and the lock wait is
bounded. A call that cannot take the lock in time plans from a read without the lock, and its count
can be lost, which delays the budget's stop by one deny.
