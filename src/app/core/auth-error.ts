import { signal } from '@angular/core';
import { isNotApprovedError } from './access.helpers';

/**
 * Whether this page load is a bounce from a signup the gate refused.
 *
 * Set once, from `main.ts`, **before** `bootstrapApplication`. It has to be
 * read that early because auth-js's `detectSessionInUrl` consumes and clears
 * `location.hash` inside its own `initialize()`, which runs as soon as the
 * client is constructed. Reading it from a component or a store hook is a
 * race that passes on localhost and loses on a slow connection.
 */
export const signupRejection = signal(false);

/**
 * Parses an OAuth error fragment. Pure, so it can be tested without a
 * browser; `main.ts` hands it the real `location.hash`.
 *
 * GoTrue puts the hook's message in `error_description` and may or may not
 * put its code in `error_code` — see docs/ACCESS-PLAN.md §11. Both are
 * offered to `isNotApprovedError`, which knows how to recognise either.
 */
export function readSignupRejection(hash: string): boolean {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.get('error')) return false;

  return isNotApprovedError({
    code: params.get('error_code') ?? undefined,
    message: params.get('error_description') ?? undefined,
  });
}
