import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { SessionStore } from './session.store';

/**
 * Waits for the initial getSession() round trip to resolve before deciding.
 * Without the filter, a hard refresh on /today bounces to /login every time.
 */
export const authGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);

  return toObservable(session.isResolved).pipe(
    filter(Boolean),
    take(1),
    // To /welcome, not /login: a stranger who lands on the app should be told
    // what it does before being asked to sign in to it. The welcome page's own
    // guard sends them on to /today the moment they have a session, so the
    // two guards cannot bounce a request between them.
    map(() => session.isAuthenticated() || router.createUrlTree(['/welcome'])),
  );
};

export const guestGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);

  return toObservable(session.isResolved).pipe(
    filter(Boolean),
    take(1),
    map(() => !session.isAuthenticated() || router.createUrlTree(['/today'])),
  );
};
