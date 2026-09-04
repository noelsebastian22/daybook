import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FakeSupabase,
  fail,
  ok,
  type RecordedCall,
  type Result,
} from '../../testing/fake-supabase';
import { makeSettings, OTHER_USER_ID, USER_ID } from '../../testing/fakes';
import type { UserSettings } from './models';
import { Push } from './push';
import { SessionStore } from './session.store';
import { SettingsStore } from './settings.store';
import { Supabase } from './supabase';
import { ToastStore } from './toast.store';

class FakePush {
  endpoint: string | null = 'https://push.example.test/abc';
  subscription: PushSubscriptionJSON | null = {
    endpoint: 'https://push.example.test/abc',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  };
  unsubscribed = 0;

  blocker(): null {
    return null;
  }
  async subscribe(): Promise<PushSubscriptionJSON | null> {
    return this.subscription;
  }
  async unsubscribe(): Promise<void> {
    this.unsubscribed++;
  }
  async currentEndpoint(): Promise<string | null> {
    return this.endpoint;
  }
}

/**
 * A result whose `data` answers differently each time it is read.
 *
 * `onFrom` is keyed on the table, and one `load()` can hit `user_settings`
 * three times — the initial select, the seeding upsert, and the re-read after
 * losing the seeding race. Those three answers are the whole difference
 * between the branches, and a single fixed result cannot express them. Each
 * round trip destructures `data` exactly once, so one read is one step.
 */
function sequence(...answers: (UserSettings | null)[]): Result<UserSettings> {
  let step = 0;
  return {
    get data() {
      return answers[Math.min(step++, answers.length - 1)];
    },
    error: null,
  };
}

function sessionFor(id: string): Session {
  return { user: { id } } as unknown as Session;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('SettingsStore', () => {
  let db: FakeSupabase;
  let store: InstanceType<typeof SettingsStore>;
  let session: InstanceType<typeof SessionStore>;
  let toast: InstanceType<typeof ToastStore>;
  let push: FakePush;

  const callsTo = (table: string): RecordedCall[] =>
    db.calls.filter((c) => c.kind === 'from' && c.name === table);

  const argsFor = (table: string, op: string): unknown[][] =>
    callsTo(table).flatMap((c) => c.chain.filter((s) => s.op === op).map((s) => s.args));

  const errorToasts = (): string[] =>
    toast
      .toasts()
      .filter((t) => t.tone === 'error')
      .map((t) => t.message);

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: Push, useClass: FakePush }] });
    db = TestBed.inject(Supabase) as unknown as FakeSupabase;
    push = TestBed.inject(Push) as unknown as FakePush;
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    session = TestBed.inject(SessionStore);
    await settle();
    session.apply(sessionFor(USER_ID));

    store = TestBed.inject(SettingsStore);
    toast = TestBed.inject(ToastStore);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('loading', () => {
    it('holds the row it read, for the user it read it for', async () => {
      db.onFrom('user_settings', ok(makeSettings({ digest_enabled: true })));

      await store.load();

      expect(store.settings()?.digest_enabled).toBe(true);
      expect(store.loaded()).toBe(true);
      expect(store.loadedFor()).toBe(USER_ID);
      expect(store.loading()).toBe(false);
      expect(argsFor('user_settings', 'eq')).toEqual([['user_id', USER_ID]]);
    });

    it('seeds a row for an account that predates the setup RPC', async () => {
      db.onFrom('user_settings', sequence(null, makeSettings()));

      await store.load();

      const [seed, options] = argsFor('user_settings', 'upsert')[0];
      expect(seed).toMatchObject({
        user_id: USER_ID,
        digest_enabled: false,
        digest_send_at: '07:00',
        seeded_at: null,
      });
      // The browser knows the zone; the column default can only guess, and a
      // wrong guess sends the digest at 5pm.
      expect((seed as UserSettings).timezone).toBe(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
      expect(options).toEqual({ onConflict: 'user_id', ignoreDuplicates: true });
      expect(store.settings()).not.toBeNull();
    });

    it('keeps what won the seeding race instead of resetting it', async () => {
      // `ensure_user_setup` inserts the same row from another path, and on a
      // brand-new account the two collide. Ignoring the duplicate makes losing
      // a no-op; the other resolution would blank the `seeded_at` the winner
      // had just written and re-run the category seeding.
      const winner = makeSettings({
        seeded_at: '2026-08-18T09:00:00.000Z',
        timezone: 'Europe/Oslo',
      });
      db.onFrom('user_settings', sequence(null, null, winner));

      await store.load();

      expect(store.settings()).toEqual(winner);
      expect(errorToasts()).toEqual([]);
    });

    it('reports a failure when the row still cannot be found afterwards', async () => {
      db.onFrom('user_settings', ok(null));

      await store.load();

      expect(store.settings()).toBeNull();
      expect(store.loaded()).toBe(true);
      expect(errorToasts()).toContain('Could not create your settings.');
    });

    it('toasts and stays unloaded when the read itself fails', async () => {
      db.onFrom('user_settings', fail('boom'));

      await store.load();

      expect(store.loaded()).toBe(false);
      expect(store.loading()).toBe(false);
      expect(errorToasts()).toContain('Could not load your settings.');
    });

    it('does not read twice when two pages ask at once', async () => {
      db.onFrom('user_settings', ok(makeSettings()));

      await Promise.all([store.load(), store.load()]);

      expect(callsTo('user_settings')).toHaveLength(1);
    });

    it('reads nothing with nobody signed in', async () => {
      session.apply(null);

      await store.load();

      expect(callsTo('user_settings')).toEqual([]);
    });
  });

  describe('ensureLoaded', () => {
    it('does not re-read for the user it already holds', async () => {
      db.onFrom('user_settings', ok(makeSettings()));
      await store.ensureLoaded();

      await store.ensureLoaded();

      expect(callsTo('user_settings')).toHaveLength(1);
    });

    it('drops the outgoing user settings and their lit push toggle', async () => {
      // The toggle describes a device registration belonging to the previous
      // account. Leaving it true showed the new one a switch that is not
      // theirs.
      db.onFrom('user_settings', ok(makeSettings({ timezone: 'Europe/Oslo' })));
      db.onFrom('push_subscriptions', ok({ id: 'push-1' }));
      await store.ensureLoaded();
      await store.loadPush();
      expect(store.pushSubscribed()).toBe(true);

      session.apply(sessionFor(OTHER_USER_ID));
      db.onFrom('user_settings', fail('boom'));
      await store.ensureLoaded();

      expect(store.settings()).toBeNull();
      expect(store.pushSubscribed()).toBe(false);
    });
  });

  describe('updating', () => {
    beforeEach(async () => {
      db.onFrom('user_settings', ok(makeSettings({ digest_enabled: false })));
      await store.load();
      db.calls.length = 0;
    });

    it('shows the new value before the server has answered', () => {
      const pending = store.update({ digest_enabled: true });

      expect(store.settings()?.digest_enabled).toBe(true);
      return pending;
    });

    it('scopes the write to the signed-in user', async () => {
      await store.update({ digest_send_at: '06:30' });

      expect(argsFor('user_settings', 'update')[0][0]).toEqual({ digest_send_at: '06:30' });
      expect(argsFor('user_settings', 'eq')[0]).toEqual(['user_id', USER_ID]);
    });

    it('rolls the whole row back when the write is refused', async () => {
      const before = store.settings();
      db.onFrom('user_settings', fail('permission denied'));

      expect(await store.update({ digest_enabled: true })).toBe(false);

      expect(store.settings()).toEqual(before);
      expect(errorToasts()).toContain('Could not save that setting.');
    });

    it('refuses to write before anything was loaded', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: Push, useClass: FakePush }] });
      const fresh = TestBed.inject(SettingsStore);

      expect(await fresh.update({ digest_enabled: true })).toBe(false);
    });
  });

  describe('this device push registration', () => {
    it('is on when a row for this endpoint comes back under this user', async () => {
      db.onFrom('push_subscriptions', ok({ id: 'push-1' }));

      await store.loadPush();

      expect(store.pushSubscribed()).toBe(true);
      expect(db.chainFor('push_subscriptions')[1].args).toEqual([
        'endpoint',
        'https://push.example.test/abc',
      ]);
    });

    it('is off for a device the other account subscribed on', async () => {
      // RLS scopes the read to the signed-in user, so no row means this
      // endpoint belongs to somebody else — which is exactly what the toggle
      // should say.
      db.onFrom('push_subscriptions', ok(null));

      await store.loadPush();

      expect(store.pushSubscribed()).toBe(false);
    });

    it('is off, and asks nothing, when this browser has no endpoint at all', async () => {
      push.endpoint = null;

      await store.loadPush();

      expect(store.pushSubscribed()).toBe(false);
      expect(callsTo('push_subscriptions')).toEqual([]);
    });

    it('registers through the RPC, which can reassign a device that changed hands', async () => {
      // An upsert cannot: RLS tests its `using` clause against the row the
      // previous owner still holds, so the new user is refused and the stale
      // row keeps pointing the cron at a device that is no longer theirs.
      expect(await store.subscribePush()).toBe(true);

      const rpc = db.calls.find((c) => c.kind === 'rpc' && c.name === 'register_push_subscription');
      expect(rpc?.chain[0].args[0]).toEqual({
        p_endpoint: 'https://push.example.test/abc',
        p_p256dh: 'p256dh-key',
        p_auth: 'auth-key',
      });
      expect(store.pushSubscribed()).toBe(true);
    });

    it('asks for nothing when the browser prompt was dismissed', async () => {
      push.subscription = null;

      expect(await store.subscribePush()).toBe(false);

      expect(db.calls.filter((c) => c.kind === 'rpc')).toEqual([]);
    });

    it('asks for nothing when the browser handed back no keys', async () => {
      push.subscription = { endpoint: 'https://push.example.test/abc' };

      expect(await store.subscribePush()).toBe(false);

      expect(db.calls.filter((c) => c.kind === 'rpc')).toEqual([]);
    });

    it('leaves no half-registered device when the server refuses', async () => {
      // The browser would hold a subscription the server never heard of,
      // which then silently never fires.
      db.onRpc('register_push_subscription', fail('permission denied'));

      expect(await store.subscribePush()).toBe(false);

      expect(push.unsubscribed).toBe(1);
      expect(store.pushSubscribed()).toBe(false);
      expect(errorToasts()).toContain('Could not turn reminders on.');
    });

    it('unregisters by endpoint, so it can only ever clear this browser row', async () => {
      db.onFrom('push_subscriptions', ok({ id: 'push-1' }));
      await store.loadPush();

      await store.unsubscribePush();

      expect(store.pushSubscribed()).toBe(false);
      expect(push.unsubscribed).toBe(1);
      expect(argsFor('push_subscriptions', 'delete')).toHaveLength(1);
      expect(argsFor('push_subscriptions', 'eq').at(-1)).toEqual([
        'endpoint',
        'https://push.example.test/abc',
      ]);
    });

    it('deletes nothing when there was no endpoint to unregister', async () => {
      push.endpoint = null;

      await store.unsubscribePush();

      expect(store.pushSubscribed()).toBe(false);
      expect(callsTo('push_subscriptions')).toEqual([]);
    });
  });
});
