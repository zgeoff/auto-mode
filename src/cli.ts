#!/usr/bin/env node
import { text } from 'node:stream/consumers';
import { readHostEnvironment } from './config/read-host-environment.ts';
import { runCLI } from './run-cli.ts';

process.exitCode = await runCLI(process.argv.slice(2), {
  stdin: () => text(process.stdin),
  stdout: process.stdout,
  stderr: process.stderr,
  host: readHostEnvironment(),
  subscribeToStopSignals: (onStop) => {
    process.on('SIGTERM', onStop);
    process.on('SIGINT', onStop);

    return () => {
      process.off('SIGTERM', onStop);
      process.off('SIGINT', onStop);
    };
  },
});
