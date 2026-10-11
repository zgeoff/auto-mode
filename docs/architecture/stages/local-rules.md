# Local rules

The local rules are the first stage a judged call meets, and they settle the calls whose safety
shows in the call itself: a tool that only reads, a shell command made only of read-only programs,
and the deletion of build output that a build regenerates. They match the call deterministically,
with no model call, and answer either allow or pass the call on. They never deny, because the rules
that deny are prose that needs a reader, and a wrong deny stops work the user asked for while a
wrong allow costs one unwatched read. The [containment check](./containment.md) is the one stage
before Jev that denies, and only on a concrete write target.

## What they allow

The local rules hold three allow lists in code, and each is a set of names, so a new member is one
line in the list:

- **Read-only tools.** Claude Code's file readers and searches, matched by tool name.
- **Read-only shell commands.** Programs that report and change nothing, plus the `git` subcommands
  that only report, such as `log` and `status`. A shell chain is allowed only when every segment of
  it is.
- **Regenerable output.** An `rm` whose every operand is a build-output or cache directory inside
  the call's current directory, matched by the directory's name.

A call the lists do not cover passes on, and so does any tool other than Bash that is not on the
read-only list. The CLI's explain note holds the exception that matched, `Read-only actions` or
`Regenerable output`, and the action log records the local stage as the one that decided.

## What they refuse to read

The local rules split a shell command into its segments at `;`, `&&`, `||`, `|`, `&` and newlines,
and judge each segment alone. They pass the whole command on when any part of it can hide an effect
the segment text does not show: a command substitution, inside double quotes or bare, a backtick, a
process substitution, any output redirection, or an unbalanced quote. A redirection makes a
reporting command write a file, so `cat log > out` is a write even though `cat` is on the read-only
list. The rules never expand a variable or a glob, so an `rm` operand that holds `*`, `~` or `$`
passes on rather than being guessed at.

## Where they sit in the path

A read-only allow returns before the task scope loads, so a read anywhere on the machine is allowed
without a scope check: the containment check reads write targets only. A regenerable-output allow
waits until the containment check has passed, because it deletes files, and the deletion must still
be inside the task scope.

When the user's Claude settings hold any block entries of their own, the local rules do not run, and
every call goes to the later stages. Only Jev reads those entries
([settings and repository facts](../evidence/settings-and-repository.md)), so a read-only allow
would skip a restriction the user wrote, even one about reading.
