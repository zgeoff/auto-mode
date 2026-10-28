import type { ReplyChannel, ScopeFacts, ScopePullRequest } from './types.ts';

export function mergeScopeFacts(all: readonly ScopeFacts[]): ScopeFacts {
  const pullRequests = new Map<string, ScopePullRequest>();

  for (const pull of all.flatMap((facts) => facts.pullRequests)) {
    pullRequests.set(`${pull.repository}#${String(pull.number)}`, pull);
  }

  const replyChannels = new Map<string, ReplyChannel>();

  for (const channel of all.flatMap((facts) => facts.replyChannels)) {
    replyChannels.set(JSON.stringify([channel.tool, channel.field, channel.recipient]), channel);
  }

  return {
    worktrees: [...new Set(all.flatMap((facts) => facts.worktrees))],
    branches: [...new Set(all.flatMap((facts) => facts.branches))],
    pullRequests: [...pullRequests.values()],
    pathGlobs: [...new Set(all.flatMap((facts) => facts.pathGlobs))],
    paths: [...new Set(all.flatMap((facts) => facts.paths))],
    replyChannels: [...replyChannels.values()],
  };
}
