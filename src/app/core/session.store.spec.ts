import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { FakeSupabase, fail, ok, type RecordedCall } from '../../testing/fake-supabase';
import { OTHER_USER_ID, USER_ID } from '../../testing/fakes';
import { Push } from './push';
import { SessionStore } from './session.store';
import { Supabase } from './supabase';
import { ToastStore } from './toast.store';

/**
 * Stands in for the real `Push`, which injects `SwPush` and so cannot be
 * constructed without `provideServiceWorker()`. It also records what sign-out
 * asked it to do, which is half of what the multi-tenancy fix is about.
 */
class FakePush {
  endpoint: string | null = 'https://push.example.test/abc';
  throwOnEndpoint = false;
  unsubscribed = 0;

  blocker(): null {
    return null;
  }
  async subscribe(): Promise<null> {
    return null;
  }
  async unsubscribe(): Promise<void> {
    this.unsubscribed++;
  }
  async currentEndpoint(): Promise<string | null> {
    if (this.throwOnEndpoint) throw new Error('registration never settled');
    return this.endpoint;
  }
}

/** Only the fields `SessionStore` reads. */
function sessionFor(id: string, metadata: Record<string, unknown> = {}): Session {
  return {
    user: { id, email: 'noel@example.test', user_metadata: metadata },
  } as unknown as Session;
}

/** Lets every already-queued promise callback run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('SessionStore', () => {
  let db: FakeSupabase;
  let push: FakePush;
  let toast: InstanceType<typeof ToastStore>;
  /** Stubbed for every test: a real navigation has no routes to match here. */
  let navigate: MockInstance;

  const rpcCalls = (fn: string): RecordedCall[] =>
    db.calls.filter((c) => c.kind === 'rpc' && c.name === fn);

  const authCalls = (name: string): RecordedCall[] =>
    db.calls.filter((c) => c.kind === 'auth' && c.name === name);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: Push, useClass: FakePush }] });
    db = TestBed.inject(Supabase) as unknown as FakeSupabase;
    push = TestBed.inject(Push) as unknown as FakePush;
    toast = TestBed.inject(ToastStore);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  describe('hydrating', () => {
    it('has not decided yet when it is first injected', () => {
      // Everything the guards do hangs off this: `isResolved` must stay false
      // until the getSession round trip lands, or a hard refresh on /today
      // bounces to /welcome every time.
      db.session = { user: { id: USER_ID, email: 'noel@example.test' } };

      const store = TestBed.inject(SessionStore);

      expect(store.status()).toBe('unknown');
      expect(store.isResolved()).toBe(false);
    });

    it('reports a stored session as signed in', async () => {
      db.session = { user: { id: USER_ID, email: 'noel@example.test' } };
      const store = TestBed.inject(SessionStore);

      await settle();

      expect(store.isAuthenticated()).toBe(true);
      expect(store.userId()).toBe(USER_ID);
    });

    it('resolves to signed out when there is no session', async () => {
      const store = TestBed.inject(SessionStore);

      await settle();

      expect(store.status()).toBe('signed-out');
      expect(store.isResolved()).toBe(true);
      expect(store.userId()).toBeNull();
    });

    it('picks a session up from an auth state change', async () => {
      const store = TestBed.inject(SessionStore);
      await settle();

      db.emitAuth('SIGNED_IN', sessionFor(USER_ID));

      expect(store.isAuthenticated()).toBe(true);
      expect(store.userId()).toBe(USER_ID);
    });
  });

  describe('first-login setup', () => {
    it('runs once even when both trigger paths fire', async () => {
      // `getSession()` resolving and `onAuthStateChange` firing INITIAL_SESSION
      // race, and their order is not guaranteed. Seeding twice is two wasted
      // round trips against a sub-100ms budget.
      db.session = { user: { id: USER_ID, email: 'noel@example.test' } };
      TestBed.inject(SessionStore);
      db.emitAuth('INITIAL_SESSION', sessionFor(USER_ID));

      await settle();

      expect(rpcCalls('ensure_user_setup')).toHaveLength(1);
    });

    it('seeds with the timezone the browser reports, not the column default', async () => {
      db.session = { user: { id: USER_ID, email: 'noel@example.test' } };
      TestBed.inject(SessionStore);

      await settle();

      expect(rpcCalls('ensure_user_setup')[0].chain[0].args[0]).toEqual({
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    });

    it('retries after a failure rather than leaving the account unseeded', async () => {
      db.session = { user: { id: USER_ID, email: 'noel@example.test' } };
      db.onRpc('ensure_user_setup', fail('boom'));
      const store = TestBed.inject(SessionStore);
      await settle();

      await store.ensureSetup();

      expect(rpcCalls('ensure_user_setup')).toHaveLength(2);
    });

    it('does not seed for a visitor with no session', async () => {
      const store = TestBed.inject(SessionStore);
      await settle();

      await store.ensureSetup();

      expect(rpcCalls('ensure_user_setup')).toEqual([]);
    });

    it('seeds again for a different user signing in on the same page load', async () => {
      db.session = { user: { id: USER_ID, email: 'noel@example.test' } };
      TestBed.inject(SessionStore);
      await settle();

      db.emitAuth('SIGNED_OUT', null);
      db.emitAuth('SIGNED_IN', sessionFor(OTHER_USER_ID));
      await settle();

      expect(rpcCalls('ensure_user_setup')).toHaveLength(2);
    });
  });

  describe('a session ending', () => {
    it('navigates away when the session is cleared from another tab', async () => {
      // `authGuard` is a CanActivateFn and only runs on a navigation, so
      // clearing the session while sitting on /today re-ran no guard and left
      // the page up until a manual reload.
      db.session = { user: { id: USER_ID, email: 'noel@example.test' } };
      TestBed.inject(SessionStore);
      await settle();

      db.emitAuth('SIGNED_OUT', null);

      expect(navigate).toHaveBeenCalledWith('/welcome');
    });

    it('leaves a signed-out visitor where they are', async () => {
      // INITIAL_SESSION fires with a null session for a visitor too, and
      // navigating on that would throw anyone deep-linking to /login over to
      // /welcome.
      TestBed.inject(SessionStore);
      await settle();

      db.emitAuth('INITIAL_SESSION', null);

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('signing out', () => {
    beforeEach(async () => {
      db.session = { user: { id: USER_ID, email: 'noel@example.test' } };
      TestBed.inject(SessionStore);
      await settle();
      db.calls.length = 0;
    });

    it('drops this device push row before it drops the session', async () => {
      // The delete goes through RLS and needs the session that owns the row.
      // Afterwards there is no auth.uid() and the row simply survives —
      // pointing the cron at a device the next person to sign in is holding,
      // who then receives the previous user's reminders, task text and all.
      await TestBed.inject(SessionStore).signOut();

      const deleteIndex = db.calls.findIndex((c) => c.name === 'push_subscriptions');
      const signOutIndex = db.calls.findIndex((c) => c.kind === 'auth' && c.name === 'signOut');
      expect(deleteIndex).toBeGreaterThanOrEqual(0);
      expect(signOutIndex).toBeGreaterThanOrEqual(0);
      expect(deleteIndex).toBeLessThan(signOutIndex);
    });

    it('deletes the row for this browser endpoint and unsubscribes it', async () => {
      await TestBed.inject(SessionStore).signOut();

      const chain = db.chainFor('push_subscriptions');
      expect(chain.map((c) => c.op)).toEqual(['delete', 'eq']);
      expect(chain[1].args).toEqual(['endpoint', 'https://push.example.test/abc']);
      expect(push.unsubscribed).toBe(1);
    });

    it('deletes nothing when this browser was never subscribed', async () => {
      push.endpoint = null;

      await TestBed.inject(SessionStore).signOut();

      expect(db.calls.filter((c) => c.name === 'push_subscriptions')).toEqual([]);
      expect(authCalls('signOut')).toHaveLength(1);
    });

    it('signs out anyway when the push cleanup throws', async () => {
      // Failing to sign out is worse than a stale row, which the next
      // registration takes over regardless.
      push.throwOnEndpoint = true;
      const store = TestBed.inject(SessionStore);

      await store.signOut();

      expect(authCalls('signOut')).toHaveLength(1);
      expect(store.isAuthenticated()).toBe(false);
    });

    it('leaves the store with nothing of the outgoing user', async () => {
      const store = TestBed.inject(SessionStore);

      await store.signOut();

      expect(store.status()).toBe('signed-out');
      expect(store.user()).toBeNull();
      expect(store.session()).toBeNull();
      expect(store.userId()).toBeNull();
    });
  });

  describe('display name', () => {
    it('prefers the full name a provider gave', async () => {
      const store = TestBed.inject(SessionStore);
      await settle();

      store.apply(sessionFor(USER_ID, { full_name: 'Noel Sebastian', name: 'noel' }));

      expect(store.displayName()).toBe('Noel Sebastian');
    });

    it('falls back to the short name, then to the email', async () => {
      const store = TestBed.inject(SessionStore);
      await settle();

      store.apply(sessionFor(USER_ID, { name: 'noel' }));
      expect(store.displayName()).toBe('noel');

      store.apply(sessionFor(USER_ID));
      expect(store.displayName()).toBe('noel@example.test');
    });

    it('is empty with nobody signed in', async () => {
      const store = TestBed.inject(SessionStore);
      await settle();

      expect(store.displayName()).toBe('');
    });
  });

  describe('signing in', () => {
    /**
     * The fake's auth methods always succeed, and the error wording is the
     * whole point of these two branches, so they are replaced for the length
     * of a test. Typed through a narrow shape rather than the client's own,
     * whose success-only return type will not accept an error.
     */
    interface AuthOverrides {
      signInWithOAuth: (args: unknown) => Promise<{ data: null; error: { message: string } }>;
      signInWithOtp: (args: unknown) => Promise<{ data: null; error: { message: string } }>;
    }
    const overrides = (): AuthOverrides => db.client.auth as unknown as AuthOverrides;

    it('confirms which address the magic link went to', async () => {
      const store = TestBed.inject(SessionStore);
      await settle();

      await store.signInWithMagicLink('noel@example.test');

      expect(store.magicLinkSentTo()).toBe('noel@example.test');
      expect(store.busy()).toBe(false);
      expect(authCalls('signInWithOtp')[0].chain[0].args[0]).toMatchObject({
        email: 'noel@example.test',
      });
    });

    it('reports a rejected magic link and confirms nothing', async () => {
      const store = TestBed.inject(SessionStore);
      await settle();
      overrides().signInWithOtp = async () => ({
        data: null,
        error: { message: 'Email rate limit exceeded' },
      });

      await store.signInWithMagicLink('noel@example.test');

      expect(store.magicLinkSentTo()).toBeNull();
      expect(store.busy()).toBe(false);
      expect(toast.toasts().map((t) => t.message)).toContain('Email rate limit exceeded');
    });

    it('points at the email link when Google is not configured', async () => {
      const store = TestBed.inject(SessionStore);
      await settle();
      overrides().signInWithOAuth = async () => ({
        data: null,
        error: { message: 'Unsupported provider: provider is not enabled' },
      });

      await store.signInWithGoogle();

      expect(toast.toasts().map((t) => t.message)).toContain(
        'Google sign-in is not configured yet. Use the email link below.',
      );
      expect(store.busy()).toBe(false);
    });

    it('asks Google for a redirect back to today', async () => {
      const store = TestBed.inject(SessionStore);
      await settle();
      db.onRpc('noop', ok(null));

      await store.signInWithGoogle();

      expect(authCalls('signInWithOAuth')[0].chain[0].args[0]).toMatchObject({
        provider: 'google',
      });
      // Nothing rolled the busy flag back, because the browser is on its way
      // to Google and this tab is about to be replaced.
      expect(store.busy()).toBe(true);
    });
  });
});
