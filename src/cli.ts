#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { parsePayload } from './harness/parse-payload.ts';
import { renderVerdict } from './harness/render-verdict.ts';
import { loadPolicy } from './policy/load-policy.ts';
import { classifyLocally } from './rules/classify-locally.ts';

const USAGE = `auto-mode — a permission classifier that runs as a hook

Usage:
  auto-mode run            Read a hook payload on stdin, write a verdict on stdout
  auto-mode print-prompt   Print the system prompt the classifier receives

Options:
  --classifier <path>   Use this framework file instead of the shipped one
  --rules <path>        Use this rule list instead of the shipped one
  --explain             With run: also write the reasoning to stderr
`;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Decides one tool call. Writing nothing is a real answer: it means auto-mode
 * has no opinion, and the harness then does whatever it would have done alone.
 * That is the right output for an unknown harness, for an event that is not a
 * tool gate, and for anything the local tier declines to judge until the model
 * tier exists.
 */
async function run(explain: boolean): Promise<number> {
  const raw = await readStdin();

  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    if (explain) {
      process.stderr.write('auto-mode: stdin is not JSON, so no verdict\n');
    }

    return 0;
  }

  const payload = parsePayload(body);

  if (payload === null) {
    if (explain) {
      process.stderr.write('auto-mode: not a tool gate this hook judges, so no verdict\n');
    }

    return 0;
  }

  const local = classifyLocally(payload);

  if (local.kind === 'allow') {
    if (explain) {
      process.stderr.write(`auto-mode: allowed by ${local.exception} (${payload.harness})\n`);
    }

    process.stdout.write(renderVerdict(payload.event, { kind: 'allow' }));

    return 0;
  }

  if (explain) {
    process.stderr.write(
      `auto-mode: ${payload.toolName} needs the model tier, which is not built yet, so no verdict\n`,
    );
  }

  return 0;
}

async function main(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      classifier: { type: 'string' },
      rules: { type: 'string' },
      explain: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const command = positionals[0];

  if (values.help === true || command === undefined) {
    process.stdout.write(USAGE);

    return 0;
  }

  if (command === 'run') {
    return run(values.explain === true);
  }

  if (command === 'print-prompt') {
    const prompt = await loadPolicy({
      ...(values.classifier === undefined ? {} : { classifierPath: values.classifier }),
      ...(values.rules === undefined ? {} : { rulesPath: values.rules }),
    });

    process.stdout.write(`${prompt}\n`);

    return 0;
  }

  process.stderr.write(`auto-mode: unknown command '${command}'\n\n${USAGE}`);

  return 2;
}

process.exitCode = await main(process.argv.slice(2));
