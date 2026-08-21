import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { Supabase } from './supabase';
import { SessionStore } from './session.store';
import { ToastStore } from './toast.store';
import { browserTimezone } from './dates';
import type { UserSettings } from './models';

interface SettingsState {
  settings: UserSettings | null;
  loading: boolean;
  loaded: boolean;
}

/**
 * `user_settings`, one row per user.
 *
 * `ensure_user_setup` seeds the row on first login, but a user who signed in
 * before that RPC existed has no row at all, so `load` upserts a default
 * rather than assuming one is there. The default timezone comes from the
 * browser instead of the column default — the column has to guess, and the
 * browser does not.
 */
export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState<SettingsState>({ settings: null, loading: false, loaded: false }),

  withMethods(
    (
      store,
      sb = inject(Supabase),
      session = inject(SessionStore),
      toast = inject(ToastStore),
    ) => {
      async function load(): Promise<void> {
        const uid = session.userId();
        if (!uid || store.loading()) return;
        patchState(store, { loading: true });

        const { data, error } = await sb.client
          .from('user_settings')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();

        if (error) {
          patchState(store, { loading: false });
          toast.error('Could not load your settings.');
          return;
        }

        if (data) {
          patchState(store, { settings: data as UserSettings, loading: false, loaded: true });
          return;
        }

        // No row: seed one so every later write is a plain update.
        const seed = {
          user_id: uid,
          timezone: browserTimezone(),
          digest_enabled: false,
          digest_send_at: '07:00',
          push_subscription: null,
          seeded_at: null,
        };
        const { data: created, error: insertError } = await sb.client
          .from('user_settings')
          .insert(seed)
          .select()
          .single();

        patchState(store, { loading: false, loaded: true });
        if (insertError || !created) {
          toast.error('Could not create your settings.');
          return;
        }
        patchState(store, { settings: created as UserSettings });
      }

      async function ensureLoaded(): Promise<void> {
        if (store.loaded() || store.loading()) return;
        await load();
      }

      /** Optimistic, like every other write in this app. */
      async function update(patch: Partial<UserSettings>): Promise<boolean> {
        const current = store.settings();
        const uid = session.userId();
        if (!current || !uid) return false;

        patchState(store, { settings: { ...current, ...patch } });

        const { error } = await sb.client
          .from('user_settings')
          .update(patch)
          .eq('user_id', uid);

        if (error) {
          patchState(store, { settings: current });
          toast.error('Could not save that setting.');
          return false;
        }
        return true;
      }

      return { load, ensureLoaded, update };
    },
  ),
);
