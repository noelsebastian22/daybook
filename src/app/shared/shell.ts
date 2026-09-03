import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SessionStore } from '../core/session.store';
import { OfflineQueue } from '../core/offline-queue';
import { Nav } from '../core/nav';
import { InstallHint } from './install-hint';
import { NAV_ITEMS } from './shell.data';

/**
 * The nav shell. A persistent drawer from `lg` up, a hamburger sheet below it,
 * with the same four destinations at both widths.
 *
 * **Opens from the button only, never a left-edge swipe** (BUILD-PLAN §9). An
 * edge swipe collides with the iOS back gesture, and losing the back gesture
 * on a PWA with no browser chrome leaves no way out of a page.
 *
 * Calendar is a top-level destination rather than a tab inside Reporting: it
 * is a way of *finding* a day, not a statistic about one.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, InstallHint],
  host: {
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly session = inject(SessionStore);
  protected readonly queue = inject(OfflineQueue);
  protected readonly nav = inject(Nav);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);

  /**
   * Two independent axes on one property. Below `lg` the sheet is driven by
   * `menuOpen`; at `lg` and up it is driven by `collapsed`, and the drawer is
   * pinned regardless of what the sheet is doing.
   *
   * Both halves are emitted from here rather than left as static classes,
   * because `lg:translate-x-0` and `lg:-translate-x-full` set the same
   * property at the same specificity — which of them won would come down to
   * their order in the generated stylesheet, not to anything in this file.
   * Only ever one of the pair is in the list.
   */
  protected readonly navClass = computed(
    () =>
      (this.menuOpen() ? 'translate-x-0' : '-translate-x-full') +
      (this.nav.collapsed() ? ' lg:-translate-x-full' : ' lg:translate-x-0'),
  );

  /**
   * An href jump alone moves the viewport but not focus. Doing it by hand
   * also avoids pushing a `#content` entry into history, which on a PWA with
   * no browser chrome would cost the user a back press to undo.
   */
  protected focusContent(event: Event): void {
    event.preventDefault();
    document.getElementById('content')?.focus();
  }

  protected readonly items = NAV_ITEMS;

  constructor() {
    // The sheet is a mobile overlay, so it has to close itself on navigation
    // or it covers the page it just moved to.
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }
}
