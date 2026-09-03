import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { Supabase } from './supabase';
import { SessionStore } from './session.store';
import { ToastStore } from './toast.store';
import { browserTimezone } from './dates';
import { Push } from './push';
import type { UserSettings } from './models';

interface SettingsState {
  settings: UserSettings | null;
  loading: boolean;
  loaded: boolean;
  /** The user id `loaded` refers to. See the same field on `TaskStore`. */
  loadedFor: string | null;
  /**
   * Whether *this browser* is registered for push under the current user.
   *
   * Deliberately per device rather than per user: since `push_subscriptions`
   * the answer differs between a phone and a laptop, and the Settings toggle
   * has always said "on this device". It used to read
   * `user_settings.push_subscription`, which could only ever describe the
   * last device to subscribe.
   */
  pushSubscribed: boolean;
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
  withState<SettingsState>({
    settings: null,
    loading: false,
    loaded: false,
    loadedFor: null,
    pushSubscribed: false,
  }),

  withMethods(
    (
      store,
      sb = inject(Supabase),
      session = inject(SessionStore),
      toast = inject(ToastStore),
      push = inject(Push),
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
          patchState(store, {
            settings: data as UserSettings,
            loading: false,
            loaded: true,
            loadedFor: uid,
          });
          return;
        }

        // No row: seed one so every later write is a plain update.
        const seed = {
          user_id: uid,
          timezone: browserTimezone(),
          digest_enabled: false,
          digest_send_at: '07:00',
          seeded_at: null,
        };
        // Upsert, not insert. `ensure_user_setup` inserts this same row from
        // a different trigger path, and on a brand-new account the two race:
        // whichever loses collides on `user_settings_pkey` and the user is
        // shown "Could not create your settings." on their very first open,
        // with settings left null. Invisible with one long-established user;
        // it would have hit a fraction of every real signup.
        //
        // `ignoreDuplicates: true` matters. The other resolution overwrites
        // the winner's row with these defaults, which would blank the
        // `seeded_at` that `ensure_user_setup` had just written and re-run
        // the category seeding — trading a visible error for a silent one.
        // Losing the race must be a no-op, not a reset.
        const { data: created, error: insertError } = await sb.client
          .from('user_settings')
          .upsert(seed, { onConflict: 'user_id', ignoreDuplicates: true })
          .select()
          .maybeSingle();

        if (insertError) {
          patchState(store, { loading: false, loaded: true, loadedFor: uid });
          toast.error('Could not create your settings.');
          return;
        }

        if (created) {
          patchState(store, {
            settings: created as UserSettings,
            loading: false,
            loaded: true,
            loadedFor: uid,
          });
          return;
        }

        // Nothing came back, so the insert was ignored and the row is
        // already there — `ensure_user_setup` won. Read what it wrote rather
        // than reporting a failure: the goal is to end up holding the
        // settings, and by this point they exist.
        const { data: existing, error: rereadError } = await sb.client
          .from('user_settings')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();

        patchState(store, { loading: false, loaded: true, loadedFor: uid });
        if (rereadError || !existing) {
          toast.error('Could not create your settings.');
          return;
        }
        patchState(store, { settings: existing as UserSettings });
      }

      /**
       * Whether this browser's endpoint is registered under the current user.
       *
       * The endpoint identifies the device; RLS scopes the read to the signed-
       * in user. So a row coming back means "this device, this account", which
       * is exactly what the toggle claims to show — and it correctly reads
       * false for a device the *other* account subscribed on.
       */
      async function loadPush(): Promise<void> {
        const endpoint = await push.currentEndpoint();
        if (!endpoint) {
          patchState(store, { pushSubscribed: false });
          return;
        }
        const { data } = await sb.client
          .from('push_subscriptions')
          .select('id')
          .eq('endpoint', endpoint)
          .maybeSingle();
        patchState(store, { pushSubscribed: !!data });
      }

      /**
       * Registers this browser for push under the current user.
       *
       * Goes through the `register_push_subscription` RPC rather than an
       * upsert, and that is the whole fix. When a device changes hands the
       * endpoint's row is still owned by the previous user, and RLS tests an
       * upsert's `using` clause against that existing row — so the new user
       * cannot take it over and the stale row survives, still pointing the
       * cron at a device that is no longer theirs. The RPC is SECURITY
       * DEFINER and reassigns it.
       */
      async function subscribePush(): Promise<boolean> {
        const subscription = await push.subscribe();
        const keys = subscription?.keys;
        if (!subscription?.endpoint || !keys?.['p256dh'] || !keys?.['auth']) {
          return false;
        }

        const { error } = await sb.client.rpc('register_push_subscription', {
          p_endpoint: subscription.endpoint,
          p_p256dh: keys['p256dh'],
          p_auth: keys['auth'],
        });

        if (error) {
          // Leave no half-registered device: the browser has a subscription
          // the server does not know about, which would silently never fire.
          await push.unsubscribe();
          toast.error('Could not turn reminders on.');
          return false;
        }

        patchState(store, { pushSubscribed: true });
        return true;
      }

      /**
       * Unregisters this browser. Also called on sign-out, which is the case
       * that matters: leaving the row behind pointed the cron at a device the
       * next person to sign in would be holding.
       *
       * Deletes by endpoint under RLS, so it can only ever remove the calling
       * user's own row — a device they no longer own is not theirs to clear.
       */
      async function unsubscribePush(): Promise<void> {
        const endpoint = await push.currentEndpoint();
        await push.unsubscribe();
        patchState(store, { pushSubscribed: false });
        if (!endpoint) return;
        await sb.client.from('push_subscriptions').delete().eq('endpoint', endpoint);
      }

      async function ensureLoaded(): Promise<void> {
        if (store.loading()) return;
        // Same reason as `TaskStore.ensureLoaded`: a second user signing in on
        // the same page load would otherwise keep the first one's settings row.
        if (store.loaded() && store.loadedFor() === session.userId()) return;
        if (store.loaded()) {
          patchState(store, {
            settings: null,
            loaded: false,
            loadedFor: null,
            // Belongs to the outgoing user's device registration, not to this
            // one. Leaving it true showed the new account a lit toggle for a
            // subscription that is not theirs.
            pushSubscribed: false,
          });
        }
        await load();
      }

      /** Optimistic, like every other write in this app. */
      async function update(patch: Partial<UserSettings>): Promise<boolean> {
        const current = store.settings();
        const uid = session.userId();
        if (!current || !uid) return false;

        patchState(store, { settings: { ...current, ...patch } });

        const { error } = await sb.client.from('user_settings').update(patch).eq('user_id', uid);

        if (error) {
          patchState(store, { settings: current });
          toast.error('Could not save that setting.');
          return false;
        }
        return true;
      }

      return { load, ensureLoaded, update, loadPush, subscribePush, unsubscribePush };
    },
  ),
);
