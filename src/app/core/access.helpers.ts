/**
 * Pure helpers for the access gate. No injection, no clock — see AGENTS.md.
 */

/**
 * Must produce the same string as the database's
 * `check (email = lower(btrim(email)))` and the hook's `lower(btrim(...))`.
 * This copy is cosmetic — it only keeps the form echoing what was stored —
 * but if it drifts from the other two the mismatch is invisible here and
 * visible as an approved person being refused.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The sentinel `hook_gate_signup` returns when an address is not allowlisted. */
const NOT_APPROVED_CODE = 'daybook_not_approved';

/**
 * Whether a failed sign-in was the access gate rather than a real auth error.
 *
 * Checks the code first and the message second. Supabase documents an error
 * object carrying `code`, `message` and `http_code`, but its own example
 * shows only the latter two, and whether `code` survives GoTrue and auth-js
 * to reach here is unverified. Once it is confirmed one way or the other,
 * delete the branch that turns out to be dead — matching on prose pins
 * wording that will be edited.
 */
export function isNotApprovedError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === NOT_APPROVED_CODE) return true;
  return (error.message ?? '').toLowerCase().includes('has not been approved');
}
