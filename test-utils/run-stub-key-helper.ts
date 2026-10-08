import { spawn } from 'node:child_process';
import { connect } from 'node:net';

// Stands in for an apiKeyCommand helper that starts a child of its own and is
// slow to print its key. It reports both process IDs on the socket named by
// its first argument, so a test can check that stopping it stops both.
const socketPath = process.argv.at(2);

if (socketPath === undefined) {
  throw new Error('run-stub-key-helper needs a socket path');
}

const child = spawn('/bin/sh', ['-c', 'sleep 30'], { stdio: 'ignore' });
const socket = connect(socketPath);

socket.on('connect', () => {
  socket.end(JSON.stringify({ helper: process.pid, child: child.pid }));
});

setTimeout(() => {
  console.log('offline-test-key');
}, 30_000);
