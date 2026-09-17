import { computed, effect, Injectable, signal } from '@angular/core';

/** What the user asked for, which is not the same as what is on screen. */
export type ThemeChoice = 'light' | 'dark' | 'system';

/** What is actually painted. `system` resolves into one of these. */
export type ResolvedTheme = 'light' | 'dark';

/**
 * Device preference, **not** user data, so the key deliberately carries no
 * uid — the same call as `daybook.nav.v1` and the opposite of
 * `daybook.queue.v1.<uid>`. The queue holds one account's pending writes and
 * leaking those across accounts was a real bug (BUILD-PLAN §9, C2). Whether
 * this screen is dark at night is a property of the screen: two accounts
 * sharing one laptop should share it, and there is nothing in it worth
 * isolating. Preference against data is the line.
 *
 * **The same key and the same rules are duplicated, on purpose, in the inline
 * script in `src/index.html`.** If you change either, change both.
 */
const KEY = 'daybook.theme.v1';

/** Matches `--color-surface` under `.dark` in `src/styles.css`. */
const DARK_THEME_COLOR = '#1e1b15';

/**
 * Matches `--color-surface` on `:root` — the paper.
 *
 * This was the brand indigo until the retheme (17 Sep 2026), which was
 * defensible while the brand was a colour the app could put text on. Coral
 * cannot be a full-bleed band at the top of the screen: it is a fill that
 * means "primary action", and a warm red strip above a cream page reads as a
 * warning. Both values are now the surface directly underneath the bar, which
 * is what the rest of this comment has always claimed the tag is for.
 */
const LIGHT_THEME_COLOR = '#fffdf7';

const MEDIA = '(prefers-color-scheme: dark)';

function load(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // Safari in private mode throws on access, not just on write.
  }
  return 'system';
}

/**
 * Which theme the app is wearing, and why.
 *
 * A plain service and not a SignalStore: a store is for state that loads,
 * fails and rolls back, and there is nothing here to load. This is chrome,
 * the same kind of thing `Nav` holds.
 *
 * `system` keeps following the OS **live**. Reading `matchMedia().matches`
 * once at boot would leave a phone that flips to dark at sunset showing a
 * white page until the next cold start, which is the whole scenario this
 * feature exists for.
 */
@Injectable({ providedIn: 'root' })
export class Theme {
  /** light / dark / system. `system` is the default for a first visit. */
  readonly choice = signal<ThemeChoice>(load());

  /**
   * The OS preference, kept in a signal because it changes outside Angular
   * and the app is zoneless — a listener that only mutated a field would
   * never repaint anything.
   */
  private readonly systemDark = signal(this.query()?.matches ?? false);

  /** What is actually on screen right now. */
  readonly resolved = computed<ResolvedTheme>(() => {
    const choice = this.choice();
    if (choice === 'system') return this.systemDark() ? 'dark' : 'light';
    return choice;
  });

  constructor() {
    const media = this.query();
    // No teardown: this service lives for the life of the document.
    media?.addEventListener('change', (e) => this.systemDark.set(e.matches));

    effect(() => this.apply(this.resolved()));
  }

  set(choice: ThemeChoice): void {
    this.choice.set(choice);
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      // A preference that cannot be saved is not worth failing a click over.
    }
  }

  private query(): MediaQueryList | null {
    return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MEDIA) : null;
  }

  /**
   * The class on `<html>` is what every semantic token in `styles.css` hangs
   * off. `theme-color` goes with it so the iOS status bar and the Android
   * address bar match the surface underneath them instead of holding one
   * colour over both themes.
   *
   * `manifest.webmanifest`'s `background_color` is deliberately left alone:
   * it paints the splash screen before any of this runs and cannot respond to
   * a runtime toggle. It is the desk, `#f6eedc`, so a dark install shows one
   * cream splash before the first paint. A manifest carries a single value and
   * there is nowhere to put the other one — the alternative is a dark splash
   * that is wrong for the majority case.
   */
  private apply(theme: ResolvedTheme): void {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
  }
}
