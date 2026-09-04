import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { Install } from './install';
import { Push } from './push';

/**
 * A push endpoint identifies a *browser install*, not a person.
 *
 * That is the whole reason `currentEndpoint()` exists and the reason it is
 * bounded: it answers "is this device registered", which is the question the
 * Settings toggle claims to answer and the question sign-out has to answer
 * before it drops the session — a row left behind keeps the cron pointing at
 * this device, and the next person to sign in on it receives the previous
 * user's reminders. Sign-out therefore *waits* on this call, so it must not be
 * able to hang. `SwPush.subscription` only emits once the service worker
 * registration resolves, and a registration that never settles would otherwise
 * hold sign-out open forever.
 */

/** Matches SUBSCRIPTION_TIMEOUT_MS in push.ts, which is not exported. */
const TIMEOUT_MS = 3000;

const VAPID = environment.vapidPublicKey;

interface FakeSubscription {
  endpoint: string;
  toJSON(): PushSubscriptionJSON;
}

function subscription(endpoint = 'https://push.example.test/abc'): FakeSubscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
  };
}

class FakeSwPush {
  isEnabled = true;
  subscription: Observable<FakeSubscription | null> = of(subscription());
  requested: unknown[] = [];
  unsubscribed = 0;

  /** What `requestSubscription` resolves to. Rejecting is a dismissed prompt. */
  grant: FakeSubscription | null = subscription();
  unsubscribeFails = false;

  async requestSubscription(options: unknown): Promise<FakeSubscription> {
    this.requested.push(options);
    if (!this.grant) throw new Error('NotAllowedError');
    return this.grant;
  }

  async unsubscribe(): Promise<void> {
    if (this.unsubscribeFails) throw new Error('no subscription');
    this.unsubscribed++;
  }
}

class FakeInstall {
  isStandalone = true;
}

describe('Push', () => {
  let swPush: FakeSwPush;
  let install: FakeInstall;

  function push(): Push {
    return TestBed.inject(Push);
  }

  beforeEach(() => {
    swPush = new FakeSwPush();
    install = new FakeInstall();
    environment.vapidPublicKey = VAPID;

    TestBed.configureTestingModule({
      providers: [
        { provide: SwPush, useValue: swPush },
        { provide: Install, useValue: install },
      ],
    });
  });

  afterEach(() => {
    environment.vapidPublicKey = VAPID;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('whether the toggle can be offered at all', () => {
    it('is offerable when the build, the worker, the install and the permission all agree', () => {
      vi.stubGlobal('Notification', { permission: 'default' });
      expect(push().blocker()).toBeNull();
    });

    it('says a build with no VAPID key is unconfigured rather than failing at the prompt', () => {
      environment.vapidPublicKey = '';
      expect(push().blocker()).toBe('unconfigured');
    });

    it('says a development build has no service worker, which is expected and not a fault', () => {
      swPush.isEnabled = false;
      expect(push().blocker()).toBe('no-service-worker');
    });

    it('says the app has to be installed first, because iOS allows this nowhere else', () => {
      install.isStandalone = false;
      expect(push().blocker()).toBe('not-installed');
    });

    it('says notifications are blocked, which the app cannot undo from here', () => {
      vi.stubGlobal('Notification', { permission: 'denied' });
      expect(push().blocker()).toBe('denied');
    });

    it('does not treat a browser with no Notification API as a denial', () => {
      vi.stubGlobal('Notification', undefined);
      expect(push().blocker()).toBeNull();
    });

    it('reports the missing key before anything else, so a broken build reads as broken', () => {
      environment.vapidPublicKey = '';
      swPush.isEnabled = false;
      install.isStandalone = false;

      expect(push().blocker()).toBe('unconfigured');
    });
  });

  describe('subscribing', () => {
    it('hands the browser this build’s public key', async () => {
      await push().subscribe();

      expect(swPush.requested).toEqual([{ serverPublicKey: VAPID }]);
    });

    it('returns the subscription as JSON, which is what the row is written from', async () => {
      const result = await push().subscribe();

      expect(result).toEqual({
        endpoint: 'https://push.example.test/abc',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      });
    });

    it('reads a dismissed prompt as no subscription rather than throwing at the caller', async () => {
      swPush.grant = null;

      await expect(push().subscribe()).resolves.toBeNull();
    });

    it('owns no state — it reports the subscription and leaves storing it to the caller', async () => {
      const service = push();
      await service.subscribe();
      await service.subscribe();

      expect(swPush.requested).toHaveLength(2);
    });
  });

  describe('unsubscribing', () => {
    it('asks the browser to drop the subscription', async () => {
      await push().unsubscribe();

      expect(swPush.unsubscribed).toBe(1);
    });

    it('says nothing when there was nothing to drop — there is no undo to offer', async () => {
      swPush.unsubscribeFails = true;

      await expect(push().unsubscribe()).resolves.toBeUndefined();
    });
  });

  describe('this browser’s current endpoint', () => {
    it('reports the endpoint the browser already holds, without prompting for one', async () => {
      await expect(push().currentEndpoint()).resolves.toBe('https://push.example.test/abc');
      expect(swPush.requested).toEqual([]);
    });

    it('is null when this browser has no subscription', async () => {
      swPush.subscription = of(null);

      await expect(push().currentEndpoint()).resolves.toBeNull();
    });

    it('is null rather than an error on every development build', async () => {
      swPush.isEnabled = false;
      let touched = false;
      swPush.subscription = new Observable(() => {
        touched = true;
      });

      await expect(push().currentEndpoint()).resolves.toBeNull();
      // Not merely null: the stream is never reached, so a disabled worker
      // cannot throw on subscribe either.
      expect(touched).toBe(false);
    });

    it('is null when the browser reports an error instead of a subscription', async () => {
      swPush.subscription = throwError(() => new Error('registration failed'));

      await expect(push().currentEndpoint()).resolves.toBeNull();
    });

    it('gives up rather than holding sign-out open behind a registration that never settles', async () => {
      vi.useFakeTimers();
      swPush.subscription = new Subject<FakeSubscription | null>();

      const pending = push().currentEndpoint();
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1);

      await expect(pending).resolves.toBeNull();
    });

    it('waits for a registration that is merely slow', async () => {
      vi.useFakeTimers();
      const late = new Subject<FakeSubscription | null>();
      swPush.subscription = late;

      const pending = push().currentEndpoint();
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 500);
      late.next(subscription('https://push.example.test/slow'));

      await expect(pending).resolves.toBe('https://push.example.test/slow');
    });
  });
});
