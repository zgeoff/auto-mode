#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadPolicy } from './policy/load-policy.ts';

const USAGE = `auto-mode — a permission classifier that runs as a hook

Usage:
  auto-mode print-prompt   Print the system prompt the classifier receives

Options:
  --classifier <path>   Use this framework file instead of the shipped one
  --rules <path>        Use this rule list instead of the shipped one
`;

async function main(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      classifier: { type: 'string' },
      rules: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const command = positionals[0];

  if (values.help === true || command === undefined) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (command !== 'print-prompt') {
    process.stderr.write(`auto-mode: unknown command '${command}'\n\n${USAGE}`);
    return 2;
  }

  const prompt = await loadPolicy({
    ...(values.classifier === undefined ? {} : { classifierPath: values.classifier }),
    ...(values.rules === undefined ? {} : { rulesPath: values.rules }),
  });

  process.stdout.write(`${prompt}\n`);

  return 0;
}

process.exitCode = await main(process.argv.slice(2));
