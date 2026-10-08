import { execFileSync } from 'node:child_process';

// A git hook exports GIT_DIR and its family, and the host config can sign or
// template a commit, so the child sees only this minimal environment.
export function runGit(home: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd: home,
    encoding: 'utf8',
    env: {
      PATH: process.env['PATH'],
      HOME: home,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'dev',
      GIT_AUTHOR_EMAIL: 'dev@example.com',
      GIT_COMMITTER_NAME: 'dev',
      GIT_COMMITTER_EMAIL: 'dev@example.com',
    },
  });
}
