import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  UrlTree,
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  type RouterStateSnapshot,
} from '@angular/router';
import type { Session } from '@supabase/supabase-js';
import type { Observable } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeSupabase } from '../../testing/fake-supabase';
import { USER_ID } from '../../testing/fakes';
import { authGuard, guestGuard } from './auth.guard';
import { Push } from './push';
import { SessionStore } from './session.store';
import { Supabase } from './supabase';

class FakePush {
  blocker(): null {
    return null;
  }
  async subscribe(): Promise<null> {
    return null;
  }
  async unsubscribe(): Promise<void> {}
  async currentEndpoint(): Promise<string | null> {
    return null;
  }
}

function sessionFor(id: string): Session {
  return { user: { id } } as unknown as Session;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

/**
 * Runs a guard and collects what it decides.
 *
 * Subscribed rather than awaited, because "has not decided yet" is one of the
 * three answers that matter and a promise cannot express it. The guards are
 * driven by `toObservable`, which emits through an effect, so nothing arrives
 * until change detection runs — hence the explicit `TestBed.tick()` at each
 * point a decision could have been made.
 */
function decisionsOf(guard: CanActivateFn): (boolean | UrlTree)[] {
  const seen: (boolean | UrlTree)[] = [];
  const result = TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  ) as Observable<boolean | UrlTree>;
  result.subscribe((value) => seen.push(value));
  return seen;
}

describe('the route guards', () => {
  let db: FakeSupabase;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Push, useClass: FakePush }],
    });
    db = TestBed.inject(Supabase) as unknown as FakeSupabase;
  });

  describe('authGuard', () => {
    it('waits for the session round trip before deciding anything', async () => {
      // Without the wait, a hard refresh on /today bounces to the signed-out
      // side every time: the guard runs before getSession() has answered.
      TestBed.inject(SessionStore);

      const decisions = decisionsOf(authGuard);
      TestBed.tick();
      expect(decisions).toEqual([]);

      await settle();
      TestBed.tick();
      expect(decisions).toHaveLength(1);
    });

    it('lets a signed-in user through', async () => {
      db.session = { user: { id: USER_ID, email: 'noel@example.test' } };
      TestBed.inject(SessionStore);
      await settle();

      const decisions = decisionsOf(authGuard);
      TestBed.tick();

      expect(decisions).toEqual([true]);
    });

    it('sends a stranger to welcome, not to the sign-in form', async () => {
      // Somebody who lands on the app should be told what it does before
      // being asked to sign in to it.
      TestBed.inject(SessionStore);
      await settle();

      const decisions = decisionsOf(authGuard);
      TestBed.tick();

      expect(decisions[0]).toBeInstanceOf(UrlTree);
      expect(String(decisions[0])).toBe('/welcome');
    });
  });

  describe('guestGuard', () => {
    it('lets a signed-out visitor read the welcome page', async () => {
      TestBed.inject(SessionStore);
      await settle();

      const decisions = decisionsOf(guestGuard);
      TestBed.tick();

      expect(decisions).toEqual([true]);
    });

    it('bounces somebody who is already signed in to today', async () => {
      db.session = { user: { id: USER_ID, email: 'noel@example.test' } };
      TestBed.inject(SessionStore);
      await settle();

      const decisions = decisionsOf(guestGuard);
      TestBed.tick();

      expect(decisions[0]).toBeInstanceOf(UrlTree);
      expect(String(decisions[0])).toBe('/today');
    });
  });

  it('cannot bounce a request between the two guards', async () => {
    // Whichever way the session goes, exactly one of the pair says yes.
    const store = TestBed.inject(SessionStore);
    await settle();

    const signedOut = [decisionsOf(authGuard), decisionsOf(guestGuard)];
    TestBed.tick();
    expect(signedOut.map((d) => d[0] === true)).toEqual([false, true]);

    store.apply(sessionFor(USER_ID));
    const signedIn = [decisionsOf(authGuard), decisionsOf(guestGuard)];
    TestBed.tick();
    expect(signedIn.map((d) => d[0] === true)).toEqual([true, false]);
  });
});
