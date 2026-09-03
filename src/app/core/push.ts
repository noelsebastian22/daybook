import { inject, Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { Install } from './install';

/**
 * How long to wait for the service worker registration to hand over this
 * browser's existing subscription. Bounded because sign-out waits on it; see
 * {@link Push.currentEndpoint}.
 */
const SUBSCRIPTION_TIMEOUT_MS = 3000;

/** Why the push toggle cannot be offered, in words a person can act on. */
export type PushBlocker = 'unconfigured' | 'no-service-worker' | 'not-installed' | 'denied' | null;

/**
 * Web Push subscription.
 *
 * iOS only allows this from a PWA added to the home screen, and only from
 * 16.4 — a subscription attempt in Safari proper throws rather than prompting,
 * so {@link blocker} checks for standalone display mode before offering the
 * toggle at all. Getting a hard error where a switch used to be is worse than
 * being told why the switch is missing.
 *
 * The service worker is disabled in dev builds, so this reports
 * `no-service-worker` there. That is expected, not a fault.
 */
@Injectable({ providedIn: 'root' })
export class Push {
  private readonly swPush = inject(SwPush);
  // One definition of "installed", shared with the hint that tells people how
  // to get there. Two copies of this check would drift, and the toggle and the
  // banner disagreeing about it is the worst way to find that out.
  private readonly install = inject(Install);

  blocker(): PushBlocker {
    if (!environment.vapidPublicKey) return 'unconfigured';
    if (!this.swPush.isEnabled) return 'no-service-worker';
    if (!this.install.isStandalone) return 'not-installed';
    if (globalThis.Notification?.permission === 'denied') return 'denied';
    return null;
  }

  /**
   * Returns the subscription as JSON for `user_settings.push_subscription`,
   * or null if the prompt was dismissed. The caller stores it; this service
   * deliberately owns no state.
   */
  async subscribe(): Promise<PushSubscriptionJSON | null> {
    try {
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: environment.vapidPublicKey,
      });
      return subscription.toJSON();
    } catch {
      return null;
    }
  }

  async unsubscribe(): Promise<void> {
    try {
      await this.swPush.unsubscribe();
    } catch {
      // Already gone, or the browser dropped it. Either way there is nothing
      // to undo, and the stored subscription is cleared by the caller.
    }
  }

  /**
   * This browser's existing endpoint, without prompting for one.
   *
   * The endpoint is the identity of a push target, so it is what tells us
   * whether *this device* is registered — as opposed to whether the user has
   * push on somewhere else. Needed both to render the toggle honestly and to
   * delete the right row on sign-out.
   *
   * Returns null rather than throwing when the service worker is disabled,
   * which is every dev build.
   */
  async currentEndpoint(): Promise<string | null> {
    if (!this.swPush.isEnabled) return null;
    try {
      // Bounded, because `subscription` only emits once the service worker
      // registration resolves and a registration that never settles would
      // otherwise hang sign-out behind it. Timing out is caught below and
      // read as "no endpoint", which is the safe answer here.
      const subscription = await firstValueFrom(
        this.swPush.subscription.pipe(timeout({ first: SUBSCRIPTION_TIMEOUT_MS })),
      );
      return subscription?.endpoint ?? null;
    } catch {
      return null;
    }
  }
}
