## HARD BLOCK rules

### Secret Exfiltration
Sending credentials, tokens, keys, or their containing files to any destination
outside the machine. This covers a network request whose body carries a secret, a
commit that adds one, a paste into an issue or a chat, and a write into a file
that is already tracked for upload.

Reading a secret to use it is not exfiltration. Sending it is.

### Secret Persistence
Writing a credential in plain text into a file under version control, into a
Dockerfile or an image layer, into a CI configuration, or into a log the agent
knows is shipped.

### Policy Tampering
Editing, moving, disabling, or rewriting auto-mode's own configuration, this
policy file, or the hook that installs it. Also: changing the harness settings
that decide whether the hook runs at all.

An agent that can edit its own restraints has none.

### Audit Tampering
Deleting or rewriting logs, shell history, audit records, or git history for the
purpose of hiding what happened. Truncating a log file that is filling a disk is
not this rule; rewriting one to remove evidence is.

### Destructive Payload
Writing or running code whose purpose is damage or spread: a fork bomb, a wiper,
code that encrypts files for ransom, code that copies itself to other hosts, or a
reverse shell to a host the user did not name.

## SOFT BLOCK rules

Each rule names the detail the user must say.

### Irreversible Deletion
Deleting a path outside the current working tree, deleting a whole working tree,
or writing to a block device.

**Must name:** the path, or an unmistakable description of it.

Examples that match: `rm -rf ~`, `rm -rf /`, `rm -rf ..`, `dd of=/dev/sda`,
`shred` on a source file, deleting a sibling repository.

### Uncommitted Work Destruction
Discarding changes in the working tree that exist nowhere else: `git reset
--hard`, `git checkout -- .`, `git restore .`, `git clean -fd`, `git stash drop`,
`git stash clear`, deleting a branch that holds unmerged commits.

**Must name:** that the changes go away. "Reset hard" and "throw away my changes"
both do it. "Clean up" does not.

This rule does not apply when the working tree is clean. Check first.

### History Rewrite
Rewriting published history: `git push --force` and `--force-with-lease` against
a shared branch, `git rebase` of pushed commits, `git filter-branch`, `git filter-repo`, `git commit --amend` on a pushed commit, deleting a remote branch or tag.

**Must name:** force, rewrite, or the remote branch.

`--force-with-lease` is safer than `--force`. It is not exempt.

### Default Branch Write
Committing, pushing, or merging directly to the default branch: `main`, `master`,
`trunk`, `develop`, or whatever the remote reports as default.

**Must name:** the branch.

### Publish and Release
Anything that puts an artifact where other people install it: `npm publish`,
`cargo publish`, `pypi upload`, `twine`, `gh release create`, pushing an image to
a registry, `docker push`, a deploy command.

**Must name:** publish, release, or deploy, plus the target.

### Outbound Communication
Content that reaches another person: an email, a Slack or Teams message, a
comment on an issue or a pull request, a new issue, a review, a post to any
external service that other people read.

**Must name:** that the message is sent, and to whom or where.

Reading these services is allowed. Writing to them is not.

### Shared Infrastructure
Commands against a cluster, a cloud account, or a host that is not this machine:
`kubectl` outside a local context, `terraform apply`, `aws`, `gcloud`, `az`,
`ssh` that runs a mutating command, `systemctl` on a remote host.

**Must name:** the environment or the resource.

Read-only calls are allowed: `get`, `describe`, `list`, `plan`, `--dry-run`.

### Destructive Database Operation
`DROP`, `TRUNCATE`, `ALTER ... DROP`, an `UPDATE` or `DELETE` with no `WHERE`, or
a migration that drops a column, against any database that is not local.

**Must name:** the table or the database, and the operation.

### Persistent Configuration
Changes that outlive the session: shell startup files, `git config --global`,
`crontab`, a systemd unit, a launch agent, `PATH`, a package manager registry or
its credentials, an editor or agent configuration outside the working tree.

**Must name:** the file or the setting.

### Mass Modification
One action that changes many files or many resources at once: a find-and-replace
across a repository, a loop that deletes in bulk, a script that touches every row
or every resource in a namespace.

**Must name:** the scope. "Rename the symbol everywhere" names it. "Fix the
imports" does not authorise rewriting four hundred files.

## ALLOW exceptions

These override the SOFT BLOCK rules above. They never override a HARD BLOCK.

Without these, the policy blocks routine work and becomes noise.

### Regenerable output
Deleting anything the build reproduces: `node_modules`, `dist`, `build`, `out`,
`target`, `.next`, `.nuxt`, `.turbo`, `.parcel-cache`, `__pycache__`, `.pytest_cache`, `.venv`, `venv`, `coverage`, `.gradle`, `vendor` under a package manager,
a lock file the agent is about to regenerate, `*.pyc`, `*.o`, `*.class`.

`rm -rf node_modules` is allowed. So is `rm -rf dist && npm run build`.

### Scratch space
Any path under the session scratchpad, `/tmp`, `$TMPDIR`, or a directory the
agent created this session and nothing else uses.

### Local services
A database, a queue, or a service on `localhost`, `127.0.0.1`, `::1`, a Unix
socket in the working tree, a container the agent started this session, or a
SQLite file inside the working tree.

Dropping a local test database is allowed. Dropping one at a remote host is not.

### Read-only actions
Reading, listing, searching, diffing, describing, and planning. Any command whose
documented effect is to print and not to change.

### The current feature branch
Committing, amending, rebasing, and force-pushing a branch that the agent created
this session and that no other branch tracks.

The point of a feature branch is that it is cheap to rewrite.

### Dry runs
A command carrying `--dry-run`, `--check`, `--no-act`, `--plan`, or an equivalent
flag that the tool documents as making no change.

