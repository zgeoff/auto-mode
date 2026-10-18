import { HOME_PATH, WINDOWS_HOME } from './identifier-patterns.ts';

// The users the hand-written corpora invent, beside the anonymiser's own
// placeholder; any other user in a home path came from a real machine.
const INVENTED_USERS = new Set(['robin', 'dev', 'user']);

const PLACEHOLDER_USER = /^user-[0-9a-f]{8}$/u;

// Each user once, since a Windows home path also reads as a Unix one.
export function collectUnanonymisedHomeUsers(text: string): string[] {
  const users = [...text.matchAll(HOME_PATH), ...text.matchAll(WINDOWS_HOME)].map((match) =>
    (match.groups?.['user'] ?? '').replace(/[.,!?]+$/u, ''),
  );

  return [...new Set(users)].filter(
    (user) => !INVENTED_USERS.has(user) && !PLACEHOLDER_USER.test(user),
  );
}
