/**
 * Where to go after signing in, when it is not /today.
 *
 * Only one place needs it: the OAuth consent page (`features/oauth-consent`),
 * which a signed-out person reaches from Claude or another MCP client and has
 * to come back to once they are in. Google and the magic link both land on
 * /today (their redirect URLs are the allow-listed ones), so the destination
 * is parked here first and `authGuard` picks it up on the way in.
 *
 * `localStorage` rather than `sessionStorage`, because a magic link opens a
 * new tab. Still per browser: a link opened in a different browser lands on
 * /today, and starting again from the client is the recovery.
 *
 * Deliberately narrow. Only a consent URL can be stored, and it expires, so
 * this cannot become an open redirect or send someone somewhere stale a week
 * later.
 */

const KEY = 'daybook.returnTo';
export const RETURN_TTL_MS = 15 * 60 * 1000;
const ALLOWED = /^\/oauth\/consent\?authorization_id=[A-Za-z0-9._~%-]{1,256}$/;

export function consentPath(authorizationId: string): string {
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

export function rememberReturn(path: string, now: number = Date.now()): void {
  if (!ALLOWED.test(path)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, at: now }));
  } catch {
    // Storage blocked: signing in still works, it just lands on /today.
  }
}

/** Reads and clears in one go, so a destination is only ever used once. */
export function takeReturn(now: number = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    localStorage.removeItem(KEY);
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { path, at } = value as { path?: unknown; at?: unknown };
    if (typeof path !== 'string' || typeof at !== 'number') return null;
    if (now - at > RETURN_TTL_MS || now < at) return null;
    return ALLOWED.test(path) ? path : null;
  } catch {
    return null;
  }
}
