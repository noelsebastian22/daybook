import { Injectable } from '@angular/core';
import { AuthClient } from '@supabase/auth-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { environment } from '../../environments/environment';

/**
 * Composes the two Supabase packages this app actually uses instead of calling
 * `createClient()`.
 *
 * `createClient()` builds a `SupabaseClient`, and that constructor instantiates
 * a `RealtimeClient` unconditionally — it is a field, not a lazy getter, so
 * nothing can tree-shake it. It also eagerly builds a `StorageClient`. Daybook
 * subscribes to no channels and uploads no files; measured against the 2.112.3
 * bundle that was 121.05 kB of raw JavaScript in the initial chunk for code
 * that never runs:
 *
 * | package                | raw kB in main |
 * |------------------------|---------------:|
 * | @supabase/realtime-js  |          31.27 |
 * | @supabase/phoenix      |          25.29 |
 * | @supabase/storage-js   |          21.40 |
 * | @supabase/supabase-js  |          10.63 |
 * | iceberg-js             |           5.25 |
 * | @supabase/functions-js |           2.85 |
 *
 * (`functions-js` is behind a getter and `iceberg-js` behind storage, but both
 * still land in the graph.) What is left below is auth-js plus postgrest-js,
 * which is every Supabase call this app makes: `client.auth.*`, `client.from()`
 * and `client.rpc()`.
 *
 * **This is a faithful re-creation of what `createClient()` did, not a
 * simplification.** Four things it sets up are load-bearing and are reproduced
 * exactly below; if you change any of them you will silently sign everybody
 * out, so change them against the upstream source rather than from memory:
 *
 * 1. **`storageKey`.** Upstream derives `sb-<first URL label>-auth-token` and
 *    that string is where every already-signed-in browser's session is sitting
 *    in `localStorage`. A different key is not an error — it is an empty read,
 *    and the whole install base is signed out on deploy.
 * 2. **The auth client's headers.** `Authorization: Bearer <publishable key>`
 *    plus `apikey`, exactly as `_initSupabaseAuthClient` sets them.
 * 3. **The auth defaults.** `flowType: 'implicit'` is upstream's default and
 *    the magic-link and Google redirects are issued against it. `persistSession`,
 *    `autoRefreshToken` and `detectSessionInUrl` were already explicit here.
 *    `detectSessionInUrl` is what consumes the OAuth fragment on the way back
 *    to /today; it is handled entirely inside auth-js's own `initialize()`, so
 *    it does not depend on anything `SupabaseClient` used to do.
 * 4. **The PostgREST fetch wrapper.** Upstream's `fetchWithAuth` reads the
 *    current session on *every* request and sends the user's JWT as the bearer,
 *    falling back to the publishable key when signed out. Without it every
 *    query runs as `anon` and RLS returns an empty set rather than an error —
 *    which looks exactly like "the account has no tasks".
 *
 * The one thing deliberately not reproduced is `_listenForAuthEvents`, whose
 * entire body is `this.realtime.setAuth(token)`.
 */

/** Upstream sends this on every request; keep it so the API logs still say who called. */
const CLIENT_INFO = 'daybook (supabase-js/2.112.3 composed; auth-js + postgrest-js)';

/**
 * `validateSupabaseUrl` + the `new URL(path, base)` joins from the upstream
 * constructor. The trailing slash matters: without it `new URL('auth/v1', base)`
 * would replace the last path segment instead of appending.
 */
const baseUrl = new URL(
  environment.supabaseUrl.endsWith('/') ? environment.supabaseUrl : `${environment.supabaseUrl}/`,
);

/** `sb-${baseUrl.hostname.split('.')[0]}-auth-token`, verbatim from upstream. */
const storageKey = `sb-${baseUrl.hostname.split('.')[0]}-auth-token`;

@Injectable({ providedIn: 'root' })
export class Supabase {
  readonly auth = new AuthClient({
    url: new URL('auth/v1', baseUrl).href,
    headers: {
      Authorization: `Bearer ${environment.supabaseKey}`,
      apikey: environment.supabaseKey,
      'X-Client-Info': CLIENT_INFO,
    },
    storageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Upstream's DEFAULT_AUTH_OPTIONS. Stated rather than defaulted because
    // auth-js's own default is not guaranteed to be the same value.
    flowType: 'implicit',
  });

  private readonly rest = new PostgrestClient(new URL('rest/v1', baseUrl).href, {
    headers: { 'X-Client-Info': CLIENT_INFO },
    schema: 'public',
    fetch: (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      this.fetchWithAuth(input, init),
  });

  /**
   * The surface the stores were already using. Kept as `client` so no call site
   * changes, and structural so nothing outside this file names a vendor type.
   */
  readonly client = {
    auth: this.auth,
    from: (relation: string) => this.rest.from(relation),
    rpc: (fn: string, args: Record<string, unknown> = {}) => this.rest.rpc(fn, args),
  };

  /** Upstream's `fetchWithAuth` for the REST client, reduced to the branches this app hits. */
  private async fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // Per request, not cached: this is also what refreshes an expired token, so
    // hoisting it out of here would start sending stale JWTs after an hour.
    const { data } = await this.auth.getSession();
    const headers = new Headers(init?.headers);
    if (!headers.has('apikey')) headers.set('apikey', environment.supabaseKey);
    if (!headers.has('Authorization')) {
      headers.set(
        'Authorization',
        `Bearer ${data.session?.access_token ?? environment.supabaseKey}`,
      );
    }
    return fetch(input, { ...init, headers });
  }
}
