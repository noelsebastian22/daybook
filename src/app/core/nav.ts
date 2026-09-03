import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

/**
 * Device preference, **not** user data, so the key deliberately carries no
 * uid — unlike `daybook.queue.v1.<uid>` (BUILD-PLAN §9, C2). Whether the
 * sidebar is folded away is a property of this screen, not of whoever is
 * signed in on it, and two accounts sharing one laptop should share it. It
 * holds nothing worth isolating.
 */
const KEY = 'daybook.nav.v1';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === 'collapsed';
  } catch {
    // Safari in private mode throws on access, not just on write.
    return false;
  }
}

/**
 * Chrome state that outlives any one page: whether the desktop drawer is
 * folded away, and whether the Today composer is open.
 *
 * Both live here rather than in `Shell` because three components that are not
 * anywhere near each other in the tree need them. The drawer width is read by
 * `toasts.ts` to keep a toast centred on the content column, and the composer
 * is opened by a button in the drawer while it renders inside `Today`.
 */
@Injectable({ providedIn: 'root' })
export class Nav {
  private readonly router = inject(Router);

  /** Desktop only. Below `lg` the drawer is a sheet and this is ignored. */
  readonly collapsed = signal(load());

  readonly composerOpen = signal(false);

  /** Set only across the navigation that `openComposer` itself started. */
  private opening = false;

  constructor() {
    // Leaving Today closes the composer. Without this, opening it, navigating
    // to Calendar and coming back finds it still open over a list the user
    // never asked to add to.
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (!this.opening) this.composerOpen.set(false);
      });
  }

  toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem(KEY, next ? 'collapsed' : 'open');
    } catch {
      // A preference that cannot be saved is not worth failing a click over.
    }
  }

  /**
   * The drawer's Add task button works from every page, so it has to land
   * somewhere a composer exists. Today is the only list that is always the
   * right answer — Upcoming and a past day both schedule by position, and
   * guessing which day they meant would be wrong more often than not.
   */
  openComposer(): void {
    this.opening = true;
    void this.router.navigate(['/today']).then(() => {
      this.opening = false;
      this.composerOpen.set(true);
    });
  }
}
