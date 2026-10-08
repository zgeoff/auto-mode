import { toRepositorySlug } from '../containment/to-repository-slug.ts';

export interface PullRequestAddress {
  readonly repository: string;
  readonly number: number;
}

// `gh pr create` prints the new PR's address last.
export function parsePullRequestAddress(text: string): PullRequestAddress | null {
  const groups = [...text.matchAll(PULL_REQUEST_URL)].at(-1)?.groups;
  const repository = toRepositorySlug(`https://${groups?.['repository'] ?? ''}`);

  return repository === null ? null : { repository, number: Number(groups?.['number']) };
}

const PULL_REQUEST_URL =
  /https:\/\/(?<repository>[^/\s]+\/[^/\s]+\/[^/\s]+)\/pull\/(?<number>[1-9]\d*)\b/gu;
