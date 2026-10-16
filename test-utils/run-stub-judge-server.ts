import { appendFileSync } from 'node:fs';
import { startJudgeServer } from '../src/judge/start-judge-server.ts';

// Stands in for the CLI that the judge server client starts: it takes the same
// `judge-server <socket>` arguments, ends after STUB_JUDGE_SERVER_IDLE_MS
// without a review, and appends its pid to STUB_JUDGE_SERVER_RECORD.
const [command, socketPath] = process.argv.slice(2);

if (command !== 'judge-server' || socketPath === undefined) {
  process.exit(2);
}

const record = process.env['STUB_JUDGE_SERVER_RECORD'];

if (record !== undefined) {
  appendFileSync(record, `${JSON.stringify({ pid: process.pid })}\n`);
}

const server = await startJudgeServer({
  socketPath,
  env: process.env,
  idleMs: Number(process.env['STUB_JUDGE_SERVER_IDLE_MS'] ?? '2000'),
});

await server?.closed;
