/**
 * Who is allowed to call `notify`.
 *
 * Its own file rather than a helper inside index.ts so that `auth.test.mjs`
 * can import the real implementation — index.ts calls `Deno.serve` at module
 * load and cannot be imported from Node. Same arrangement as webpush.ts.
 */
import { liveSecretKeys } from '../_shared/secret-keys.ts';

/** Length-safe, no early return on the first differing byte. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hasServiceRoleClaim(token: string): boolean {
  const claims = token.split('.')[1];
  if (!claims) return false;

  const base64 = claims.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const decoded = JSON.parse(
      atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)),
    ) as { role?: string };
    return decoded.role === 'service_role';
  } catch {
    return false;
  }
}

/**
 * The gateway's `verify_jwt` proves only that a token was signed by this
 * project — and the anon key is such a token, shipped in the public browser
 * bundle. `notify` runs every query with the service role, so without this
 * check anyone who reads the app's JavaScript can trigger real emails and
 * pushes. That is not hypothetical: it was done, with the anon key, on
 * 21 Aug 2026, and a real digest was delivered.
 *
 * Two accepted shapes, because Supabase issues two and the cron may carry
 * either:
 *
 *   1. An exact match against one of the project's live secret keys — every
 *      value in SUPABASE_SECRET_KEYS, or SUPABASE_SERVICE_ROLE_KEY where that
 *      is unset (see `_shared/secret-keys.ts`). This is the only way to
 *      recognise a modern `sb_secret_…` key, which is opaque rather than a
 *      JWT and carries no readable claims. Matching the live set rather than
 *      one fixed variable is what makes a key revoked in the dashboard stop
 *      working here too.
 *   2. A JWT whose `role` claim is `service_role` — the legacy key format.
 *      Signature verification is the gateway's job and has already happened by
 *      the time this runs, so reading the claim is enough. That holds only
 *      while `verify_jwt` stays true; deploying with it off makes this half
 *      forgeable. Check 1 is unaffected, being a secret comparison.
 */
export function isServiceRole(req: Request, env = Deno.env): boolean {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return false;

  // Every key is compared, with no early exit, so timing does not reveal
  // which one matched or how many there are.
  let matched = false;
  for (const key of liveSecretKeys(env)) {
    if (constantTimeEquals(token, key)) matched = true;
  }
  if (matched) return true;

  return hasServiceRoleClaim(token);
}
