import { computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  withHooks,
  patchState,
} from '@ngrx/signals';
import type { Session, User } from '@supabase/supabase-js';
import { Supabase } from './supabase';
import { ToastStore } from './toast.store';
import { browserTimezone } from './dates';
import { Push } from './push';

type AuthStatus = 'unknown' | 'signed-in' | 'signed-out';

interface SessionState {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  busy: boolean;
  /** Set after a magic link is sent, so the login screen can confirm it. */
  magicLinkSentTo: string | null;
}

export const SessionStore = signalStore(
  { providedIn: 'root' },
  withState<SessionState>({
    status: 'unknown',
    user: null,
    session: null,
    busy: false,
    magicLinkSentTo: null,
  }),

  withComputed((store) => ({
    isAuthenticated: computed(() => store.status() === 'signed-in'),
    isResolved: computed(() => store.status() !== 'unknown'),
    userId: computed(() => store.user()?.id ?? null),
    displayName: computed(() => {
      const u = store.user();
      if (!u) return '';
      const meta = u.user_metadata as Record<string, unknown> | undefined;
      return (meta?.['full_name'] as string) || (meta?.['name'] as string) || u.email || '';
    }),
  })),

  withMethods((store, sb = inject(Supabase), toast = inject(ToastStore), push = inject(Push)) => {
    /** The user id {@link ensureSetup} has already run for this page load. */
    let setupRanFor: string | null = null;

    /**
     * Drops this browser's push registration and the row behind it.
     *
     * Hand-rolled here rather than delegating to `SettingsStore`, which owns
     * the same three lines: `SettingsStore` injects `SessionStore`, so calling
     * back into it would close a dependency cycle. The duplication is two
     * statements and the alternative is an injector graph that does not
     * resolve.
     */
    async function unregisterDevice(): Promise<void> {
      const endpoint = await push.currentEndpoint();
      await push.unsubscribe();
      if (!endpoint) return;
      await sb.client.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }

    const apply = (session: Session | null) =>
      patchState(store, {
        session,
        user: session?.user ?? null,
        status: session ? 'signed-in' : 'signed-out',
      });

    return {
      apply,

      /**
       * Creates user_settings and the default categories on first login.
       * Idempotent server-side, so calling it twice corrupts nothing — but it
       * was being called twice on every single app open, which is two wasted
       * round trips against a sub-100ms budget.
       *
       * Two paths race here and both are legitimate: `getSession()` resolving,
       * and `onAuthStateChange` firing `INITIAL_SESSION`. Their order is not
       * guaranteed, so this runs once per user id rather than trying to decide
       * which one should own the call. A failure clears the latch so the next
       * trigger retries instead of leaving the account unseeded.
       */
      async ensureSetup(): Promise<void> {
        const userId = store.user()?.id ?? null;
        if (!userId || setupRanFor === userId) return;
        setupRanFor = userId;

        const { error } = await sb.client.rpc('ensure_user_setup', {
          p_timezone: browserTimezone(),
        });
        if (error) {
          setupRanFor = null;
          console.error('ensure_user_setup failed', error);
        }
      },

      async signInWithGoogle(): Promise<void> {
        patchState(store, { busy: true });
        const { error } = await sb.client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${location.origin}/today` },
        });
        if (error) {
          patchState(store, { busy: false });
          toast.error(
            error.message.includes('provider')
              ? 'Google sign-in is not configured yet. Use the email link below.'
              : error.message,
          );
        }
      },

      async signInWithMagicLink(email: string): Promise<void> {
        patchState(store, { busy: true, magicLinkSentTo: null });
        const { error } = await sb.client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${location.origin}/today` },
        });
        patchState(store, { busy: false });
        if (error) {
          toast.error(error.message);
          return;
        }
        patchState(store, { magicLinkSentTo: email });
      },

      async signOut(): Promise<void> {
        // Before `auth.signOut()`, not after: the delete goes through RLS and
        // needs the session that owns the row. Afterwards there is no
        // `auth.uid()` and the row simply survives.
        //
        // That survival is the bug. A push endpoint identifies a browser
        // install, not a person, so a row left behind keeps pointing the cron
        // at this device — and the next person to sign in on it receives the
        // previous user's reminders, task text and all. RLS cannot help: the
        // cron sends as `service_role`.
        //
        // Best effort by design. It cannot run for the other ways a session
        // ends — an expired token, a sign-out in another tab — because those
        // have no usable session either. The server-side half of the defence
        // is `register_push_subscription`, which reassigns the endpoint to
        // whoever subscribes next, so a missed cleanup is closed the moment
        // the new user turns reminders on.
        try {
          await unregisterDevice();
        } catch {
          // Never block sign-out on it. Failing to sign out is worse than a
          // stale row that the next registration will take over anyway.
        }
        await sb.client.auth.signOut();
        apply(null);
      },
    };
  }),

  withHooks({
    onInit(store, sb = inject(Supabase), router = inject(Router)) {
      void sb.client.auth.getSession().then(({ data }) => {
        store.apply(data.session);
        if (data.session) void store.ensureSetup();
      });

      sb.client.auth.onAuthStateChange((_event, session) => {
        const wasSignedOut = !store.session();
        // `authGuard` is a CanActivateFn, so it only runs on a navigation.
        // Clearing the session while sitting on /today re-ran no guard and
        // left the page up until a manual reload — the reload rebuilt every
        // store from cold and only then bounced to /welcome. The navigation
        // has to be pushed from here.
        //
        // Here rather than in `signOut()` because Supabase fires this for
        // every way a session can end: the button, a sign-out in another tab,
        // a revoked or expired token. All three left the same stale page up.
        const wasSignedIn = store.status() === 'signed-in';
        store.apply(session);
        if (session && wasSignedOut) void store.ensureSetup();
        // Only on a real transition. This also fires INITIAL_SESSION with a
        // null session for a signed-out visitor, and navigating on that would
        // throw anyone who deep-linked to /login over to /welcome.
        if (!session && wasSignedIn) void router.navigateByUrl('/welcome');
      });
    },
  }),
);
