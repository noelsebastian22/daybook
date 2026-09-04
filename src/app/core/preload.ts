import { Injectable } from '@angular/core';
import type { PreloadingStrategy, Route } from '@angular/router';
import { EMPTY, from, mergeMap, type Observable } from 'rxjs';

/**
 * Fetches the chunks behind the drawer while the browser is doing nothing.
 *
 * Every route in this app is lazy, which keeps the initial bundle honest but
 * means the *first* tap on Upcoming, Calendar or Reporting waits on a network
 * round trip before anything renders. AGENTS.md sets a sub-100ms bar on every
 * interaction; a cold 5 kB chunk over mobile data is not that. Preloading is
 * the one way to buy the bar back without putting the code in the initial
 * bundle.
 *
 * **Not `PreloadAllModules`.** That would also drag in `welcome` (10.72 kB)
 * and `login` (39.34 kB) — both `guestGuard`ed, so a signed-in user can never
 * reach either — and `settings`, which is a once-a-month destination. The
 * opt-in below is `data: { preload: true }` in `app.routes.ts`, so the list of
 * what gets warmed is legible at the routes rather than hidden in here.
 *
 * Two guards on top of that, because this is a phone-first PWA:
 *
 * - **Save-Data / 2G.** If the browser says the connection is expensive or
 *   slow, nothing is speculatively fetched. Chromium-only; Safari reports no
 *   connection info at all, so iOS always preloads. That is the right default
 *   — the four chunks together are about 25 kB raw.
 * - **Idle.** `requestIdleCallback` keeps the fetches off the critical path,
 *   behind the first paint and behind whatever the initial navigation is
 *   still doing. Without it the preloads compete with the session check and
 *   the first task load, which are the two requests that decide LCP.
 */
@Injectable({ providedIn: 'root' })
export class WarmDrawerDestinations implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (route.data?.['preload'] !== true) return EMPTY;
    if (isExpensiveConnection()) return EMPTY;
    return from(whenIdle()).pipe(mergeMap(() => load()));
  }
}

/**
 * `navigator.connection` is not in the DOM lib because it is not standardised.
 * Narrowed here rather than cast to `any` — the two fields below are the whole
 * of what this file cares about.
 */
interface NetworkInformation {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

function isExpensiveConnection(): boolean {
  const connection = (globalThis.navigator as Navigator & { connection?: NetworkInformation })
    ?.connection;
  if (!connection) return false;
  return (
    connection.saveData === true ||
    connection.effectiveType === 'slow-2g' ||
    connection.effectiveType === '2g'
  );
}

/**
 * Resolves on the first idle period. Falls back to a macrotask where
 * `requestIdleCallback` is missing — a plain `setTimeout` still lands after
 * the current navigation's work, which is most of the point.
 */
function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 2000 });
    } else {
      setTimeout(resolve, 500);
    }
  });
}
