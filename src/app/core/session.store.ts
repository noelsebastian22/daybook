import { computed, inject } from '@angular/core';
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

  withMethods((store, sb = inject(Supabase), toast = inject(ToastStore)) => {
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
       * Idempotent, so calling it on every sign-in is fine.
       */
      async ensureSetup(): Promise<void> {
        const { error } = await sb.client.rpc('ensure_user_setup', {
          p_timezone: browserTimezone(),
        });
        if (error) console.error('ensure_user_setup failed', error);
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
        await sb.client.auth.signOut();
        apply(null);
      },
    };
  }),

  withHooks({
    onInit(store, sb = inject(Supabase)) {
      void sb.client.auth.getSession().then(({ data }) => {
        store.apply(data.session);
        if (data.session) void store.ensureSetup();
      });

      sb.client.auth.onAuthStateChange((_event, session) => {
        const wasSignedOut = !store.session();
        store.apply(session);
        if (session && wasSignedOut) void store.ensureSetup();
      });
    },
  }),
);
