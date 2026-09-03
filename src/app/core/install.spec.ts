import { afterEach, describe, expect, it, vi } from 'vitest';
import { Install } from './install';

interface FakeNav {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone?: boolean;
}

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

/**
 * Builds an `Install` against a faked browser. The service reads `globalThis`
 * lazily on every call, so stubbing is enough — no injector needed.
 */
function install(
  nav: Partial<FakeNav>,
  {
    standaloneMedia = false,
    dismissed = false,
  }: { standaloneMedia?: boolean; dismissed?: boolean } = {},
): Install {
  vi.stubGlobal('navigator', {
    userAgent: MAC_CHROME,
    platform: 'MacIntel',
    maxTouchPoints: 0,
    ...nav,
  });
  vi.stubGlobal('matchMedia', () => ({ matches: standaloneMedia }));
  const store = new Map<string, string>();
  if (dismissed) store.set('daybook.install-hint.dismissed', '1');
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  return new Install();
}

afterEach(() => vi.unstubAllGlobals());

describe('isIos', () => {
  it('recognises an iPhone', () => {
    expect(install({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 }).isIos).toBe(true);
  });

  it('recognises an iPad, which reports itself as a Mac', () => {
    // iPadOS 13+ ships a desktop user agent, so the UA alone misses every
    // iPad. A touch-capable MacIntel is the only thing left to go on.
    expect(install({ userAgent: IPAD_AS_MAC, platform: 'MacIntel', maxTouchPoints: 5 }).isIos).toBe(
      true,
    );
  });

  it('does not mistake a real Mac for an iPad', () => {
    expect(install({ userAgent: MAC_CHROME, platform: 'MacIntel', maxTouchPoints: 0 }).isIos).toBe(
      false,
    );
  });

  it('does not fire on Android', () => {
    expect(install({ userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 }).isIos).toBe(
      false,
    );
  });
});

describe('isStandalone', () => {
  it('reads the legacy WebKit flag, which is the one iOS sets', () => {
    const svc = install({
      userAgent: IPHONE,
      platform: 'iPhone',
      maxTouchPoints: 5,
      standalone: true,
    });
    expect(svc.isStandalone).toBe(true);
  });

  it('reads the display-mode media query everywhere else', () => {
    expect(install({ userAgent: ANDROID }, { standaloneMedia: true }).isStandalone).toBe(true);
  });

  it('is false in a plain tab', () => {
    expect(install({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 }).isStandalone).toBe(
      false,
    );
  });
});

describe('shouldHint', () => {
  const iphone = { userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 };

  it('hints on an iOS browser that is not the installed app', () => {
    expect(install(iphone).shouldHint()).toBe(true);
  });

  it('does not hint once the app is installed', () => {
    // The whole point of the banner is already done.
    expect(install({ ...iphone, standalone: true }).shouldHint()).toBe(false);
  });

  it('does not hint on a platform that installs itself', () => {
    expect(install({ userAgent: ANDROID, platform: 'Linux armv8l' }).shouldHint()).toBe(false);
    expect(install({ userAgent: MAC_CHROME }).shouldHint()).toBe(false);
  });

  it('does not hint after it has been dismissed', () => {
    expect(install(iphone, { dismissed: true }).shouldHint()).toBe(false);
  });

  it('stops hinting the moment it is dismissed, and remembers it', () => {
    const svc = install(iphone);
    expect(svc.shouldHint()).toBe(true);
    svc.dismiss();
    expect(svc.shouldHint()).toBe(false);
    expect(globalThis.localStorage.getItem('daybook.install-hint.dismissed')).toBe('1');
  });

  it('survives a localStorage that refuses to be read or written', () => {
    // Private mode. Dismissing must not throw at someone closing a banner.
    vi.stubGlobal('navigator', { ...iphone });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    const svc = new Install();
    expect(svc.shouldHint()).toBe(true);
    expect(() => svc.dismiss()).not.toThrow();
    expect(svc.shouldHint()).toBe(false);
  });
});
