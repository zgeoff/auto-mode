#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { configPath, loadConfig } from './config/config.ts';
import { parsePayload } from './harness/parse-payload.ts';
import { renderVerdict } from './harness/render-verdict.ts';
import type { Harness } from './harness/types.ts';
import { hookConfig, SETTINGS_PATHS, SETUP_NOTES } from './install/hook-config.ts';
import { classifyWithModel } from './model/classify-with-model.ts';
import { loadPolicy } from './policy/load-policy.ts';
import { classifyLocally } from './rules/classify-locally.ts';

const USAGE = `auto-mode — a permission classifier that runs as a hook

Usage:
  auto-mode run              Read a hook payload on stdin, write a verdict on stdout
  auto-mode print-prompt     Print the system prompt the classifier receives
  auto-mode init <harness>   Print the hook entry to add: claude, codex or muse

Options:
  --classifier <path>   Use this framework file instead of the shipped one
  --rules <path>        Use this rule list instead of the shipped one
  --explain             With run: also write the reasoning to stderr
  --local-only          With run: skip the model tier
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
async function run(explain: boolean, localOnly: boolean): Promise<number> {
  const raw = await readStdin();

  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    return note(explain, 'stdin is not JSON, so no verdict');
  }

  const payload = parsePayload(body);

  if (payload === null) {
    return note(explain, 'not a tool gate this hook judges, so no verdict');
  }

  const local = classifyLocally(payload);

  if (local.kind === 'allow') {
    process.stdout.write(renderVerdict(payload.event, { kind: 'allow' }));

    return note(explain, `allowed by ${local.exception} (${payload.harness}, local)`);
  }

  if (localOnly) {
    return note(explain, `${payload.toolName} needs the model tier, which --local-only skipped`);
  }

  const config = await loadConfig();
  const outcome = await classifyWithModel(payload, config);

  if (outcome.verdict !== null) {
    process.stdout.write(renderVerdict(payload.event, outcome.verdict));
  }

  return note(explain, outcome.note);
}

function note(explain: boolean, text: string): number {
  if (explain) {
    process.stderr.write(`auto-mode: ${text}\n`);
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
      'local-only': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const command = positionals[0];

  if (values.help === true || command === undefined) {
    process.stdout.write(USAGE);

    return 0;
  }

  if (command === 'run') {
    return run(values.explain === true, values['local-only'] === true);
  }

  if (command === 'init') {
    const harness = positionals[1];

    if (harness !== 'claude' && harness !== 'codex' && harness !== 'muse') {
      process.stderr.write("auto-mode init: name a harness — claude, codex or muse\n");

      return 2;
    }

    const target = harness as Harness;

    process.stdout.write(`# Add this to ${SETTINGS_PATHS[target]}\n`);
    process.stdout.write(`# Configuration lives at ${configPath()}\n`);
    process.stdout.write(`${hookConfig(target, `${process.execPath} ${process.argv[1] ?? 'auto-mode'} run`)}\n`);

    for (const line of SETUP_NOTES[target]) {
      process.stdout.write(`# ${line}\n`);
    }

    return 0;
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
