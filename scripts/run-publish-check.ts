import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import type { PublishAction } from './pick-publish-action.ts';
import { pickPublishAction } from './pick-publish-action.ts';
import type { RunProgram } from './run-program.ts';
import { runProgram } from './run-program.ts';

export interface PublishCheckOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runProgram: RunProgram;
}

export function runPublishCheck(options: Readonly<PublishCheckOptions>): PublishAction {
  const text = readFileSync(join(options.cwd, 'package.json'), 'utf8');
  const manifest = manifestSchema.parse(JSON.parse(text));

  // release-please tags a node package <name>-v<version>.
  const tag = `${manifest.name}-v${manifest.version}`;
  const run = { cwd: options.cwd, env: options.env };

  return pickPublishAction({
    name: manifest.name,
    version: manifest.version,
    tag,
    registry: options.runProgram(
      ['npm', 'view', `${manifest.name}@${manifest.version}`, 'version', '--json'],
      run,
    ),
    tagLookup: options.runProgram(
      ['git', 'ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`],
      run,
    ),
  });
}

const manifestSchema = z.object({ name: z.string(), version: z.string() });

function runCLI(): void {
  const output = process.env['GITHUB_OUTPUT'];

  if (output === undefined) {
    process.stderr.write('publish check: GITHUB_OUTPUT is not set\n');

    process.exitCode = 2;

    return;
  }

  const action = runPublishCheck({ cwd: process.cwd(), env: process.env, runProgram });

  if (action.kind === 'fail') {
    process.stderr.write(`publish check: ${action.reason}\n`);

    process.exitCode = 1;

    return;
  }

  process.stdout.write(`publish check: ${action.reason}\n`);

  appendFileSync(output, `publish=${action.kind === 'publish'}\n`);
}

if (import.meta.main) {
  runCLI();
}
