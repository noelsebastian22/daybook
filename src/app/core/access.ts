import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import type { AccessDecision, AccessLookup, AccessOutcome } from './models';
import { normalizeEmail } from './access.helpers';

/**
 * The outward calls the two signed-out access pages make: the request form,
 * and the page Noel decides on.
 *
 * A plain `fetch` rather than `functions.invoke`, because there is no
 * `functions.invoke` in this app and there must not be one: `core/supabase.ts`
 * composes auth-js and postgrest-js by hand instead of calling
 * `createClient()`, and `@supabase/functions-js` was measured at 2.85 kB and
 * dropped in Phase 8. Re-adding the package for a single call site would
 * reverse that for nothing.
 *
 * A service rather than a call from the component, because the URL, the
 * headers and the error mapping do not belong in a component class — and
 * because `render()` takes `providers`, so the page's states are testable
 * against a stub without teaching `FakeSupabase` about Edge Functions.
 *
 * Not a store: no shared state, nothing to load, nothing to roll back. Same
 * reasoning as `Nav` and `Theme`.
 */
@Injectable({ providedIn: 'root' })
export class Access {
  private readonly base = `${environment.supabaseUrl.replace(/\/$/, '')}/functions/v1/access`;

  /**
   * Throws on a network or server failure, so the caller can toast and leave
   * the form as it was. A resolved promise always means the address is now
   * accounted for.
   */
  async request(email: string, note: string): Promise<AccessOutcome> {
    const response = await fetch(`${this.base}/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Not a credential here — `verify_jwt` is off for this function — but
        // sent so the request is attributed to this project in Supabase's
        // logs rather than arriving anonymous.
        apikey: environment.supabaseKey,
      },
      body: JSON.stringify({ email: normalizeEmail(email), note }),
    });

    const body = (await response.json().catch(() => null)) as {
      outcome?: AccessOutcome;
      error?: string;
    } | null;

    if (!response.ok || !body?.outcome) {
      throw new Error(body?.error ?? 'Could not send that request.');
    }

    return body.outcome;
  }

  /** What a decision link is for. Reads only; opening the page decides nothing. */
  lookup(token: string): Promise<AccessLookup> {
    return this.post<AccessLookup>('lookup', { token });
  }

  /** Spends the token. Throws on a network failure, which leaves it unspent. */
  decide(token: string, decision: 'approve' | 'deny'): Promise<AccessDecision> {
    return this.post<AccessDecision>('decide', { token, decision });
  }

  /**
   * The token goes in the body, never the URL, for the same reason the email
   * puts it in the fragment: request logs record URLs, not bodies.
   */
  private async post<T extends { state: string }>(route: string, payload: object): Promise<T> {
    const response = await fetch(`${this.base}/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: environment.supabaseKey },
      body: JSON.stringify(payload),
    });

    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok || !body?.state) {
      throw new Error(body?.error ?? 'Could not reach the server.');
    }
    return body;
  }
}
