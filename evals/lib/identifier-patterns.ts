// The patterns both the identifier scan and the rewriter read, so a value the
// scan finds is the value the rewriter replaces.
export type IdentifierClass = 'user' | 'host' | 'owner' | 'repo' | 'branch';

export const HOME_PATH = /\/(?<base>home|Users)\/(?<user>[^/\s"'`:;|&<>()]+)/gu;

export const WINDOWS_HOME =
  /\b(?<prefix>[A-Za-z]:[\\/]+Users[\\/]+)(?<user>[^\\/\s"'`:;|&<>()]+)/gu;

export const URL_AUTHORITY =
  /\b(?<scheme>[a-z][a-z0-9+.-]*:\/\/)(?:(?<userinfo>[^\s/@"'<>]+)@)?(?<host>[A-Za-z0-9.-]+)(?<port>:\d+)?(?:\/(?<first>[^\s/?#"'<>]+)(?:\/(?<second>[^\s/?#"'<>]+))?)?/giu;

export const KEPT_ADDRESSES = new Set(['127.0.0.1', '0.0.0.0', '::1', '::', 'localhost']);
export const SCP_REMOTE = /\b(?<user>[\w.-]+)@(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+):/gu;
export const EMAIL = /\b[\w.+-]+@(?<host>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/gu;
export const SHARED_USERS = new Set(['git', 'x-access-token', 'oauth2', 'token']);

export type Groups = Readonly<Record<string, string | undefined>>;
