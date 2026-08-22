import { Injectable, signal } from '@angular/core';

const DISMISSED_KEY = 'daybook.install-hint.dismissed';

/**
 * Whether the app is running from the home screen, and whether it is worth
 * telling this browser how to put it there.
 *
 * iOS fires no `beforeinstallprompt` and offers no install affordance of any
 * kind — the option is buried in the Share sheet. Noel could not find it on
 * 22 Aug and it had to be talked through, which is the failure the hint in
 * `shared/install-hint.ts` exists to prevent. Every other platform either
 * prompts on its own or does not need the app installed, so the hint is iOS
 * only rather than a banner everybody has to dismiss.
 *
 * Installing is not cosmetic here. Web Push on iOS only works from a
 * standalone PWA, so an uninstalled Daybook can never deliver a reminder; and
 * an uninstalled site can have its cached storage evicted after roughly seven
 * days, which takes the offline queue with it.
 */
@Injectable({ providedIn: 'root' })
export class Install {
  /**
   * True when launched from the home screen. `display-mode: standalone` is the
   * standard; `navigator.standalone` is the older WebKit flag and is still the
   * one that answers on iOS.
   */
  get isStandalone(): boolean {
    const iosStandalone = (globalThis.navigator as { standalone?: boolean }).standalone;
    return globalThis.matchMedia?.('(display-mode: standalone)').matches || iosStandalone === true;
  }

  /**
   * iPadOS 13+ reports itself as a Mac, so the user agent alone misses every
   * iPad. A touch-capable "MacIntel" is the standard way to catch them, and
   * there is no touch-screen Mac for it to confuse.
   */
  get isIos(): boolean {
    const nav = globalThis.navigator;
    if (!nav) return false;
    if (/iphone|ipad|ipod/i.test(nav.userAgent)) return true;
    return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
  }

  private readonly dismissed = signal(this.readDismissed());

  /**
   * Show the hint only where it can be acted on: an iOS browser that is not
   * already running the installed app, and has not been told to stop asking.
   */
  readonly shouldHint = () => this.isIos && !this.isStandalone && !this.dismissed();

  dismiss(): void {
    this.dismissed.set(true);
    try {
      globalThis.localStorage?.setItem(DISMISSED_KEY, '1');
    } catch {
      // Private mode can refuse writes. Dismissing for this session is still
      // better than throwing at someone who just closed a banner.
    }
  }

  private readDismissed(): boolean {
    try {
      return globalThis.localStorage?.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  }
}
