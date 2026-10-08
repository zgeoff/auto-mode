import { readFileSync } from 'node:fs';
import * as z from 'zod';

// Stands in for the `gh pr view` lookup: its first argument names a JSON file
// of the pull requests the forge holds, the rest are gh's own arguments, and
// like gh it exits 1 for a pull request it does not hold.
const pullRequestsSchema = z.array(
  z.strictObject({
    repository: z.string(),
    number: z.number(),
    headRefName: z.string(),
    createdAt: z.string(),
    delayMs: z.number().optional(),
    exitCode: z.number().optional(),
  }),
);

const [statePath, ...args] = process.argv.slice(2);

if (statePath === undefined) {
  throw new Error('run-stub-gh needs the path of its pull request file');
}

const [command, action, number, repoFlag, repository, jsonFlag, fields, jqFlag, jq] = args;

const isSupported =
  args.length === 9 &&
  command === 'pr' &&
  action === 'view' &&
  repoFlag === '--repo' &&
  jsonFlag === '--json' &&
  fields === 'headRefName,createdAt' &&
  jqFlag === '--jq' &&
  jq === '[.headRefName, .createdAt] | @tsv';

if (!isSupported) {
  process.stderr.write(`unknown command or flags: gh ${args.join(' ')}\n`);
  process.exit(1);
}

const pull = pullRequestsSchema
  .parse(JSON.parse(readFileSync(statePath, 'utf8')))
  .find((entry) => entry.repository === repository && String(entry.number) === number);

if (pull === undefined) {
  process.stderr.write(
    `GraphQL: Could not resolve to a PullRequest with the number of ${number ?? ''}. (repository.pullRequest)\n`,
  );

  process.exit(1);
}

setTimeout(() => {
  process.stdout.write(`${pull.headRefName}\t${pull.createdAt}\n`, () => {
    process.exit(pull.exitCode ?? 0);
  });
}, pull.delayMs ?? 0);
