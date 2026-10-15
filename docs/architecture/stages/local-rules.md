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

- **Read-only tools.** Claude Code's file readers and searches, matched by tool name. `WebFetch` and
  `WebSearch` are not on the list, because they reach the network, so Jev reads their target.
- **Read-only shell commands.** Programs that report and change nothing, plus the `git` subcommands
  that only report, such as `log` and `status`. A shell chain is allowed only when every segment of
  it is.
- **Regenerable output.** An `rm` whose every operand is a build-output or cache directory inside
  the call's current directory, matched by the directory's name.

Some reporting programs take an option that runs another command, writes a file, or changes the
machine: `find -exec` and `find -delete`, `fd -x`, `rg --pre`, `sort -o`, `uniq`'s second operand,
and `git log --output`. A second table holds those options per program, and a command that uses one
passes on. The rules read the arguments as getopt does, so an option inside a short cluster such as
`sort -uo FILE`, or a long one cut to a prefix such as `--out=FILE`, counts as the option. A program
whose effects live in an argument the rules cannot read, such as an `awk` program or a `yq -i` edit,
is not on the list at all. `git tag` and `git ls-remote` are not on the subcommand list, because one
writes a ref and the other reaches the network, and a `git -c` or `--exec-path` option passes on
because either can name a program for git to run.

A call the lists do not cover passes on, and so does any tool other than Bash that is not on the
read-only list. The CLI's explain note holds the exception that matched, `Read-only actions` or
`Regenerable output`, and the action log records the local stage as the one that decided.

## What they refuse to read

The local rules split a shell command into its segments at `;`, `&&`, `||`, `|`, `&` and newlines,
and judge each segment alone. They pass the whole command on when any part of it can hide an effect
the segment text does not show: a command substitution, inside double quotes or bare, a backtick, a
process substitution, any output redirection, or an unbalanced quote. A redirection makes a
reporting command write a file, so `cat log > out` is a write even though `cat` is on the read-only
list. A segment that starts with a `NAME=value` assignment or a wrapper such as `env`, `sudo`,
`command` or `timeout` passes on too: the assignment can change what the program does, as
`GIT_EXTERNAL_DIFF` does for `git diff`, and the wrapper runs a program the list never sees. The
rules read the words through the same splitters the containment check uses, `splitCommandWords` and
`splitGitCommand`, and pass on any segment where the first word is not the program. The rules never
expand a variable or a glob, so an `rm` operand that holds `*`, `~` or `$` passes on rather than
being guessed at.

## Where they sit in the path

A read-only allow returns before the task scope loads, so a read anywhere on the machine is allowed
without a scope check: the containment check reads write targets only. A regenerable-output allow
waits until the containment check has passed, because it deletes files, and the deletion must still
be inside the task scope.

When the user's Claude settings hold any block entries of their own, the local rules do not run, and
every call goes to the later stages. Only Jev reads those entries
([settings and repository facts](../evidence/settings-and-repository.md)), so a read-only allow
would skip a restriction the user wrote, even one about reading.
