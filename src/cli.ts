#!/usr/bin/env node
import { text } from 'node:stream/consumers';
import { readRuntime } from './config/read-runtime.ts';
import { runCLI } from './run-cli.ts';

process.exitCode = await runCLI(process.argv.slice(2), {
  stdin: () => text(process.stdin),
  stdout: process.stdout,
  stderr: process.stderr,
  runtime: readRuntime(),
  subscribeToStopSignals: (onStop) => {
    process.on('SIGTERM', onStop);
    process.on('SIGINT', onStop);

    return () => {
      process.off('SIGTERM', onStop);
      process.off('SIGINT', onStop);
    };
  },
  judgeServerCommand: [process.execPath, import.meta.filename],
});
