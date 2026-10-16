import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import * as z from 'zod';

// MSW cannot reach a spawned claude, so this stands in for the `claude` the
// Agent SDK drives over stream-json. Its controls avoid the ANTHROPIC_ prefix,
// which the judge removes from the child environment.
const recordPath = process.env['STUB_CLAUDE_RECORD'];

// An environment string cannot hold a reply past the kernel's argument limit,
// so a byte count pads the reply with spaces to that size.
const reply = (process.env['STUB_CLAUDE_REPLY'] ?? '').padEnd(
  Number(process.env['STUB_CLAUDE_REPLY_BYTES'] ?? 0),
);

const isError = process.env['STUB_CLAUDE_IS_ERROR'] === 'true';
const crashes = process.env['STUB_CLAUDE_CRASH'] === 'true';
const modelUsage = process.env['STUB_CLAUDE_MODEL_USAGE'];
const safetyStops = process.env['STUB_CLAUDE_SAFETY_STOPS'];
const fallbackModel = process.env['STUB_CLAUDE_REFUSAL_FALLBACK'];
const delayMs = Number(process.env['STUB_CLAUDE_DELAY_MS'] ?? 0);
const sessionID = '00000000-0000-4000-8000-000000000000';
const CONTROL_REQUEST = z.object({ subtype: z.string(), systemPrompt: z.unknown().optional() });
const USER_MESSAGE = z.object({ content: z.string() });

const LINE = z.union([
  z.object({
    type: z.literal('control_request'),
    request_id: z.string(),
    request: CONTROL_REQUEST,
  }),
  z.object({ type: z.literal('user'), message: USER_MESSAGE }),
]);

let system: unknown = null;
let reviews = 0;
let clears = 0;

for await (const line of createInterface({ input: process.stdin })) {
  const message = LINE.safeParse(JSON.parse(line));

  if (!message.success) {
    continue;
  }

  if (message.data.type === 'control_request') {
    system = message.data.request.systemPrompt ?? system;

    printLine({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: message.data.request_id,
        response: { pid: process.pid, commands: [], models: [], agents: [] },
      },
    });

    continue;
  }

  const user = message.data.message.content;

  printLine({ type: 'system', subtype: 'init', session_id: sessionID, model: 'stub', tools: [] });

  if (user === '/clear') {
    clears += 1;

    printLine(buildResult({ result: '' }));
    continue;
  }

  reviews += 1;

  if (recordPath !== undefined) {
    appendFileSync(
      recordPath,
      `${JSON.stringify({
        pid: process.pid,
        review: reviews,
        clears,
        cwd: process.cwd(),
        argv: process.argv.slice(2),
        system,
        user,
        env: {
          ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'],
          ANTHROPIC_BASE_URL: process.env['ANTHROPIC_BASE_URL'],
          CLAUDE_CODE_USE_BEDROCK: process.env['CLAUDE_CODE_USE_BEDROCK'],
        },
      })}\n`,
    );
  }

  if (crashes) {
    process.exit(1);
  }

  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

  if (fallbackModel !== undefined) {
    printLine({
      type: 'system',
      subtype: 'model_refusal_fallback',
      trigger: 'refusal',
      direction: 'retry',
      scope: 'session',
      original_model: 'stub',
      fallback_model: fallbackModel,
      request_id: null,
      session_id: sessionID,
    });
  }

  printLine(
    buildResult({
      result: reply,
      ...(modelUsage === undefined ? {} : { modelUsage: JSON.parse(modelUsage) as unknown }),
      ...(safetyStops === undefined ? {} : { safety_stops: Number(safetyStops) }),
    }),
  );
}

function printLine(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function buildResult(fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return {
    type: 'result',
    subtype: isError ? 'error_during_execution' : 'success',
    is_error: isError,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    stop_reason: 'end_turn',
    session_id: sessionID,
    total_cost_usd: 0,
    usage: {},
    modelUsage: {},
    permission_denials: [],
    uuid: '00000000-0000-4000-8000-000000000001',
    ...fields,
  };
}
