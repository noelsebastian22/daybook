import { inject, Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { environment } from '../../environments/environment';
import { Install } from './install';

/** Why the push toggle cannot be offered, in words a person can act on. */
export type PushBlocker =
  | 'unconfigured'
  | 'no-service-worker'
  | 'not-installed'
  | 'denied'
  | null;

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
}
