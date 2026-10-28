# The reply channel

The reply channel allows a message that a session sends to a recipient its launcher declared as the
session's own, such as the agent that spawned it, without asking Jev. A spawned session reports back
to its spawner on most tasks, and Jev would judge each report under Outbound Communication, which
asks whether the user named the recipient. The launcher's scope file names the recipient instead
([declaring a session's scope](../../guides/scope-file.md)), so the stage allows the message once a
secret scan of it finds nothing.

## Which call counts

A reply channel names a tool, a field of the tool's input, and a recipient. A call matches when its
tool is that tool and the field holds exactly that recipient, as a whole string. A recipient written
into another field, a recipient that only contains the declared one, and the same recipient through
another tool all go to Jev, which judges them as outbound like any other message.

The stage runs after the [edit bypass](./edit-bypass.md) and reads the reply channels from the
[task scope](../evidence/task-scope.md), so only the launcher scope source can declare one. The
agent cannot add a channel, because the scope file sits where the agent cannot write.

The [containment check](./containment.md) runs first and counts an MCP tool whose name reads as a
remote write, such as one that creates a message, as a finding. A call that matches a reply channel
is the session's own message, so the containment check takes no finding from it, and the call
reaches this stage.

## The secret scan

The stage scans the call's input with the Betterleaks rule set that the edit bypass scans with, and
any match sends the call to Jev, where Data Exfiltration judges it. It scans the input as JSON text,
where a rule that needs a key beside its value can match, and every key and string as written, where
a rule that spans lines, such as a private key block, can match. Input larger than the scan's size
cap goes to Jev unscanned. The CLI loads the rule set only for a call that matches a reply channel.

## What the stage never does

The stage never denies: a call it does not allow goes on to Jev. A reply channel grants no consent,
so a rule that asks the user to name a target reads nothing from it. The stage does not run when the
task scope did not load, or when the user's Claude settings hold block entries, because only Jev
reads those entries ([settings and repository facts](../evidence/settings-and-repository.md)).
