/**
 * The parts of `access` that are pure, so they can be tested from Node.
 *
 * index.ts calls `Deno.serve` at module load and cannot be imported, which is
 * the same reason notify/auth.ts and notify/webpush.ts exist as their own
 * files. Web Crypto is used rather than a Deno or Node API so this file runs
 * unchanged in both.
 */

export type AccessStatus = 'pending' | 'approved' | 'denied';

/** `created` is the fourth case: no row existed and one was just written. */
export type AccessOutcome = 'created' | AccessStatus;

/**
 * The single definition of what an email address is for this feature.
 *
 * The database enforces the same shape with
 * `check (email = lower(btrim(email)))`, and the hook applies
 * `lower(btrim(...))` when it reads. All three must agree or an approved
 * person is rejected by their own approval.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Deliberately not RFC 5322. A full validator rejects addresses that work and
 * accepts ones that do not; the only thing worth catching here is a typo bad
 * enough that no mail could ever arrive.
 */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 32 bytes of CSPRNG, base64url. Long enough that guessing is not a threat. */
export function newDecisionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Only the hash is stored, so a leaked database cannot approve anybody. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function outcomeForStatus(status: AccessStatus | null): AccessOutcome {
  return status ?? 'created';
}
