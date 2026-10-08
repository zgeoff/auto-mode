#!/usr/bin/env node
import { text } from 'node:stream/consumers';
import { readHostEnvironment } from './config/read-host-environment.ts';
import { runCLI } from './run-cli.ts';

const argv = process.argv.slice(2);

const controller = new AbortController();

// A listener replaces the default exit on these signals, so only a Jev-only
// run, which the mod stops by signal, gets one.
if (argv.includes('--jev-only')) {
  process.on('SIGTERM', () => {
    controller.abort();
  });

  process.on('SIGINT', () => {
    controller.abort();
  });
}

process.exitCode = await runCLI(argv, {
  stdin: () => text(process.stdin),
  stdout: process.stdout,
  stderr: process.stderr,
  host: readHostEnvironment(),
  signal: controller.signal,
});
