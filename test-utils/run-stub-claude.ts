import { appendFileSync, readFileSync } from 'node:fs';

// MSW cannot reach a spawned claude, so a launcher for this script stands in for
// `claude -p --output-format json` on the child's PATH. Its controls avoid the
// ANTHROPIC_ prefix, which the judge removes from the child environment.
const prompt = readFileSync(0, 'utf8');
const recordPath = process.env['STUB_CLAUDE_RECORD'];

if (recordPath !== undefined) {
  appendFileSync(
    recordPath,
    `${JSON.stringify({
      pid: process.pid,
      cwd: process.cwd(),
      argv: process.argv.slice(2),
      stdin: prompt,
      env: {
        ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'],
        ANTHROPIC_BASE_URL: process.env['ANTHROPIC_BASE_URL'],
        CLAUDE_CODE_USE_BEDROCK: process.env['CLAUDE_CODE_USE_BEDROCK'],
        MAX_THINKING_TOKENS: process.env['MAX_THINKING_TOKENS'],
      },
    })}\n`,
  );
}

const isError = process.env['STUB_CLAUDE_IS_ERROR'] === 'true';
const exitCode = Number(process.env['STUB_CLAUDE_EXIT_CODE'] ?? 0);

setTimeout(
  () => {
    const body = {
      type: 'result',
      subtype: isError ? 'error_during_execution' : 'success',
      is_error: isError,
      duration_ms: 1,
      num_turns: 1,
      result: process.env['STUB_CLAUDE_REPLY'] ?? '',
      session_id: '00000000-0000-4000-8000-000000000000',
    };

    process.stdout.write(`${JSON.stringify(body)}\n`, () => {
      process.exit(exitCode);
    });
  },
  Number(process.env['STUB_CLAUDE_DELAY_MS'] ?? 0),
);
