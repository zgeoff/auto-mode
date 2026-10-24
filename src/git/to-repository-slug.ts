export function toRepositorySlug(reference: string): string | null {
  const match =
    /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?(?<host>[^/:]+)[:/](?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/iu.exec(
      reference,
    );

  if (match?.groups === undefined) {
    return null;
  }

  const parts = match.groups;

  return `${parts['host'] ?? ''}/${parts['owner'] ?? ''}/${parts['name'] ?? ''}`.toLowerCase();
}
