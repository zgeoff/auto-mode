import { toRepositorySlug } from '../containment/to-repository-slug.ts';

export interface PullRequestAddress {
  readonly repository: string;
  readonly number: number;
}

export function collectPullRequestAddresses(text: string): PullRequestAddress[] {
  const addresses = new Map<string, PullRequestAddress>();

  for (const match of text.matchAll(PULL_REQUEST_URL)) {
    const repository = toRepositorySlug(`https://${match.groups?.['repository'] ?? ''}`);
    const number = Number(match.groups?.['number']);

    if (repository !== null) {
      addresses.set(`${repository}#${String(number)}`, { repository, number });
    }
  }

  return [...addresses.values()];
}

const PULL_REQUEST_URL =
  /https:\/\/(?<repository>[^/\s]+\/[^/\s]+\/[^/\s]+)\/pull\/(?<number>[1-9]\d*)\b/gu;
