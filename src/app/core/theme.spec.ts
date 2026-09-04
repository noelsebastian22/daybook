import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Theme } from './theme';

/**
 * Three states, two of which are the same colour half the time.
 *
 * The whole service turns on one distinction: `choice` is what the user asked
 * for and `resolved` is what is on the glass. `system` is the default, and it
 * has to keep following the OS *live* — reading `matchMedia().matches` once at
 * boot would leave a phone that flips to dark at sunset white until the next
 * cold start, which is the only scenario the feature exists for. That is the
 * test that would pass against a one-shot read only by accident, so it fires
 * a real `change` at the listener the service registered.
 *
 * jsdom implements no `matchMedia` at all, so every test here says what the OS
 * is claiming; the last one says what happens when the browser cannot be asked.
 */

const KEY = 'daybook.theme.v1';
const DARK_SURFACE = '#12141f';
const BRAND = '#4f46e5';

type MediaListener = (event: { matches: boolean }) => void;

interface Os {
  /** The queries the service asked about. */
  queries: string[];
  /** Change the OS preference the way the OS does: flip, then fire. */
  flip(toDark: boolean): void;
}

function stubOs(dark = false): Os {
  const listeners: MediaListener[] = [];
  const queries: string[] = [];
  const media = {
    matches: dark,
    addEventListener: (_: string, cb: MediaListener) => void listeners.push(cb),
    removeEventListener: () => {},
  };

  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query);
    return media;
  });

  return {
    queries,
    flip(toDark: boolean) {
      media.matches = toDark;
      for (const cb of listeners) cb({ matches: toDark });
    },
  };
}

interface StorageOptions {
  saved?: string;
  /** Safari in private mode throws on *access*, not only on write. */
  throwOnRead?: boolean;
  throwOnWrite?: boolean;
}

function stubStorage({
  saved,
  throwOnRead = false,
  throwOnWrite = false,
}: StorageOptions = {}): Map<string, string> {
  const store = new Map<string, string>();
  if (saved !== undefined) store.set(KEY, saved);

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => {
      if (throwOnRead) throw new Error('SecurityError');
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (throwOnWrite) throw new Error('QuotaExceededError');
      store.set(key, value);
    },
    removeItem: (key: string) => void store.delete(key),
  });

  return store;
}

/** Runs the root effect that paints the class and the meta tag. */
function paint(): void {
  TestBed.tick();
}

function themeColour(): string | null {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;
}

function isDarkPainted(): boolean {
  return document.documentElement.classList.contains('dark');
}

describe('Theme', () => {
  beforeEach(() => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', BRAND);
    document.head.append(meta);
  });

  afterEach(() => {
    document.querySelector('meta[name="theme-color"]')?.remove();
    document.documentElement.classList.remove('dark');
    vi.unstubAllGlobals();
  });

  describe('what it remembers', () => {
    it('follows the system on a first visit', () => {
      stubOs();
      stubStorage();

      expect(TestBed.inject(Theme).choice()).toBe('system');
    });

    it('reads a saved choice back on the next page load', () => {
      stubOs();
      stubStorage({ saved: 'dark' });

      expect(TestBed.inject(Theme).choice()).toBe('dark');
    });

    it('ignores a stored value that is not one of the three', () => {
      stubOs();
      stubStorage({ saved: 'sepia' });

      expect(TestBed.inject(Theme).choice()).toBe('system');
    });

    it('starts up on a browser that throws on reading storage at all', () => {
      stubOs();
      stubStorage({ throwOnRead: true });

      expect(() => TestBed.inject(Theme)).not.toThrow();
      expect(TestBed.inject(Theme).choice()).toBe('system');
    });

    it('saves the choice under the key the boot script also reads', () => {
      stubOs();
      const store = stubStorage();

      TestBed.inject(Theme).set('dark');

      expect(store.get(KEY)).toBe('dark');
    });

    it('still changes the theme when the choice cannot be saved', () => {
      stubOs();
      stubStorage({ throwOnWrite: true });
      const theme = TestBed.inject(Theme);

      expect(() => theme.set('dark')).not.toThrow();
      expect(theme.choice()).toBe('dark');
    });
  });

  describe('what it resolves to', () => {
    it('asks the OS about the dark colour scheme', () => {
      const os = stubOs();
      stubStorage();

      TestBed.inject(Theme);

      expect(os.queries).toContain('(prefers-color-scheme: dark)');
    });

    it('wears what the OS is wearing while the choice is system', () => {
      stubOs(true);
      stubStorage();

      expect(TestBed.inject(Theme).resolved()).toBe('dark');
    });

    it('ignores the OS once the user has picked a side', () => {
      stubOs(true);
      stubStorage();
      const theme = TestBed.inject(Theme);

      theme.set('light');

      expect(theme.resolved()).toBe('light');
    });

    it('keeps following the OS after it changes, rather than reading it once at boot', () => {
      const os = stubOs(false);
      stubStorage();
      const theme = TestBed.inject(Theme);
      expect(theme.resolved()).toBe('light');

      os.flip(true);

      expect(theme.resolved()).toBe('dark');
    });

    it('stops following the OS the moment a choice is made', () => {
      const os = stubOs(false);
      stubStorage();
      const theme = TestBed.inject(Theme);
      theme.set('light');

      os.flip(true);

      expect(theme.resolved()).toBe('light');
      // The preference is still remembered, so going back to system picks the
      // OS up where it now is rather than where it was.
      theme.set('system');
      expect(theme.resolved()).toBe('dark');
    });

    it('reads light on a browser with no matchMedia to ask', () => {
      vi.stubGlobal('matchMedia', undefined);
      stubStorage();

      const theme = TestBed.inject(Theme);

      expect(theme.choice()).toBe('system');
      expect(theme.resolved()).toBe('light');
    });
  });

  describe('what it paints', () => {
    it('puts the dark class on <html>, which is what every token hangs off', () => {
      stubOs();
      stubStorage({ saved: 'dark' });

      TestBed.inject(Theme);
      paint();

      expect(isDarkPainted()).toBe(true);
    });

    it('takes the class off again on the way back to light', () => {
      stubOs();
      stubStorage({ saved: 'dark' });
      const theme = TestBed.inject(Theme);
      paint();

      theme.set('light');
      paint();

      expect(isDarkPainted()).toBe(false);
    });

    it('moves theme-color to the dark surface so the status bar is not indigo over near-black', () => {
      stubOs();
      stubStorage({ saved: 'dark' });

      TestBed.inject(Theme);
      paint();

      expect(themeColour()).toBe(DARK_SURFACE);
    });

    it('puts theme-color back to the brand in light', () => {
      stubOs();
      stubStorage({ saved: 'dark' });
      const theme = TestBed.inject(Theme);
      paint();

      theme.set('light');
      paint();

      expect(themeColour()).toBe(BRAND);
    });

    it('repaints when the OS flips underneath a system choice', () => {
      const os = stubOs(false);
      stubStorage();
      TestBed.inject(Theme);
      paint();
      expect(isDarkPainted()).toBe(false);

      os.flip(true);
      paint();

      expect(isDarkPainted()).toBe(true);
      expect(themeColour()).toBe(DARK_SURFACE);
    });

    it('survives a document with no theme-color meta to update', () => {
      document.querySelector('meta[name="theme-color"]')?.remove();
      stubOs();
      stubStorage({ saved: 'dark' });

      TestBed.inject(Theme);

      expect(() => paint()).not.toThrow();
      expect(isDarkPainted()).toBe(true);
    });
  });
});
