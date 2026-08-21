/**
 * Who is allowed to call `notify`.
 *
 * Its own file rather than a helper inside index.ts so that `auth.test.mjs`
 * can import the real implementation — index.ts calls `Deno.serve` at module
 * load and cannot be imported from Node. Same arrangement as webpush.ts.
 */

/**
 * The gateway's `verify_jwt` proves only that a token was signed by this
 * project — and the anon key is such a token, shipped in the public browser
 * bundle. `notify` runs every query with the service role, so without this
 * check anyone who reads the app's JavaScript can trigger real emails and
 * pushes. That is not hypothetical: it was done, with the anon key, on
 * 21 Aug 2026, and a real digest was delivered.
 *
 * The gateway has already verified the signature by the time this runs, so
 * reading the claims is enough; there is no second verification here. That
 * holds only while `verify_jwt` stays true — deploying this function with it
 * off makes the guard trivially forgeable.
 */
export function isServiceRole(req: Request): boolean {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const claims = token?.split('.')[1];
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
