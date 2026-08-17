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
    map(() => session.isAuthenticated() || router.createUrlTree(['/login'])),
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
