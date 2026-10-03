import { InjectionToken, inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';

/**
 * A full page load at `url`. A token so the guard's spec can watch it rather
 * than reload the test runner.
 *
 * `replaceState` first, because on an in-app navigation the address bar has
 * not moved yet and a bare `reload()` would reload the page being left. And
 * not `location.assign(url)`: when the URL differs from the current one only
 * by its fragment — which is exactly the first-load case — the browser treats
 * that as a hash change and loads nothing.
 */
export const HARD_LOAD = new InjectionToken<(url: string) => void>('HARD_LOAD', {
  providedIn: 'root',
  factory: () => (url: string) => {
    history.replaceState(null, '', url);
    location.reload();
  },
});

/**
 * The catch-all route. Before giving up on a URL and sending it to /today,
 * asks whether this tab is running an old build that simply predates it.
 *
 * Found 3 Oct. The service worker serves the version it already holds and
 * fetches the new one in the background, so the first open after a deploy
 * runs the old build. The access email linked to `/access/decide`, a route
 * added in that very deploy; the old build had never heard of it and sent
 * Noel to `/today#token=…`. The second click worked.
 *
 * So an unknown URL checks for an update, and if this tab can move onto a
 * newer version it does, and loads the same URL again — fragment included,
 * since that is where the access token lives. It cannot loop: after the
 * reload the newest version is the current one, `activateUpdate()` reports
 * nothing newer, and a URL unknown to it too goes to /today as before.
 *
 * Only unknown URLs pay for this. Every route the running build knows
 * matches before `**` and never reaches here.
 */
export const unknownRouteGuard: CanActivateFn = async (_route, state) => {
  const sw = inject(SwUpdate);
  const hardLoad = inject(HARD_LOAD);
  const today = inject(Router).createUrlTree(['/today']);

  if (!sw.isEnabled) return today;

  try {
    await sw.checkForUpdate();
    if (await sw.activateUpdate()) {
      hardLoad(state.url);
      return false;
    }
  } catch {
    // No worker to ask, or it failed. Neither is a reason to strand someone
    // on a blank page.
  }
  return today;
};
