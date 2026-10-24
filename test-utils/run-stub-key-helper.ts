import { spawn } from 'node:child_process';
import { connect } from 'node:net';

const socketPath = process.argv.at(2);
const printDelayMs = Number(process.argv.at(3) ?? 30_000);

if (socketPath === undefined) {
  throw new Error('run-stub-key-helper needs a socket path');
}

const child = spawn('sleep', ['30'], { stdio: 'ignore' });

// A child reported before its exec completes can still be in uninterruptible
// sleep (state D) while the kernel loads the binary; spawn fires after exec.
child.once('spawn', () => {
  const socket = connect(socketPath);

  socket.on('connect', () => {
    socket.end(JSON.stringify({ helper: process.pid, child: child.pid }));
  });
});

setTimeout(() => {
  console.log('offline-test-key');
}, printDelayMs);
