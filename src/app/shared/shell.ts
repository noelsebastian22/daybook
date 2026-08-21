import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SessionStore } from '../core/session.store';
import { OfflineQueue } from '../core/offline-queue';

interface NavItem {
  path: string;
  label: string;
  /** Single SVG path, 24-box. Kept inline: four icons is not a dependency. */
  icon: string;
}

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  host: {
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
  template: `
    <!--
      Five links stand in front of the content at every width, so a keyboard
      user tabs through the whole drawer before reaching the page. This jumps
      them past it. Off-screen until focused; see .skip-link in styles.css.
    -->
    <a
      href="#content"
      class="skip-link rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white"
      (click)="focusContent($event)"
    >
      Skip to content
    </a>

    <!-- mobile bar -->
    <div
      class="safe-top sticky top-0 z-30 flex items-center gap-2 bg-ink-50/80 px-2 py-2 backdrop-blur lg:hidden"
    >
      <button
        type="button"
        class="grid h-10 w-10 place-items-center rounded-xl text-ink-600 transition hover:bg-ink-100"
        aria-label="Open the menu"
        [attr.aria-expanded]="menuOpen()"
        (click)="menuOpen.set(true)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
          <path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <span class="text-sm font-semibold tracking-tight">Daybook</span>
    </div>

    <!-- scrim, mobile only -->
    @if (menuOpen()) {
      <button
        type="button"
        class="fixed inset-0 z-40 cursor-default bg-ink-900/30 lg:hidden"
        tabindex="-1"
        aria-label="Close the menu"
        (click)="menuOpen.set(false)"
      ></button>
    }

    <!--
      One <nav>, two behaviours: off-canvas and translated below lg, pinned
      above it. Rendering it twice would mean two elements with the same links
      and a duplicate landmark for screen readers.
    -->
    <nav
      class="safe-top fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-ink-200/70 bg-white px-3 py-4 transition-transform duration-200 lg:translate-x-0"
      [class]="menuOpen() ? 'translate-x-0' : '-translate-x-full'"
      aria-label="Main"
    >
      <p class="px-3 pb-4 text-sm font-semibold tracking-tight">Daybook</p>

      @if (queue.pending(); as waiting) {
        <p
          class="mx-1 mb-2 rounded-lg bg-quick-100 px-2.5 py-1.5 text-[11px] font-medium text-quick-700"
          aria-live="polite"
        >
          {{ waiting }} change{{ waiting === 1 ? '' : 's' }} waiting to sync
        </p>
      }

      <ul class="flex flex-1 flex-col gap-0.5">
        @for (item of items; track item.path) {
          <li>
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-brand-50 text-brand-700"
              #active="routerLinkActive"
              class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition"
              [class]="active.isActive ? '' : 'text-ink-600 hover:bg-ink-100'"
              [attr.aria-current]="active.isActive ? 'page' : null"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                class="h-[18px] w-[18px] shrink-0"
                aria-hidden="true"
              >
                <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="item.icon" />
              </svg>
              {{ item.label }}
            </a>
          </li>
        }
      </ul>

      <div class="border-t border-ink-100 pt-2">
        <a
          routerLink="/settings"
          routerLinkActive="bg-brand-50 text-brand-700"
          #settingsActive="routerLinkActive"
          class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition"
          [class]="settingsActive.isActive ? '' : 'text-ink-600 hover:bg-ink-100'"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            class="h-[18px] w-[18px] shrink-0"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M10.3 4.3a1 1 0 0 1 1-.8h1.4a1 1 0 0 1 1 .8l.2 1.3 1.4.8 1.2-.5a1 1 0 0 1 1.2.4l.7 1.2a1 1 0 0 1-.2 1.3l-1 .8v1.6l1 .8a1 1 0 0 1 .2 1.3l-.7 1.2a1 1 0 0 1-1.2.4l-1.2-.5-1.4.8-.2 1.3a1 1 0 0 1-1 .8h-1.4a1 1 0 0 1-1-.8l-.2-1.3-1.4-.8-1.2.5a1 1 0 0 1-1.2-.4l-.7-1.2a1 1 0 0 1 .2-1.3l1-.8v-1.6l-1-.8a1 1 0 0 1-.2-1.3l.7-1.2a1 1 0 0 1 1.2-.4l1.2.5 1.4-.8Z"
            />
            <circle cx="12" cy="12" r="2.4" />
          </svg>
          Settings
        </a>
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
          (click)="session.signOut()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            class="h-[18px] w-[18px] shrink-0"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 17v1.5A1.5 1.5 0 0 1 13.5 20h-7A1.5 1.5 0 0 1 5 18.5v-13A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V7M10 12h9m0 0-2.5-2.5M19 12l-2.5 2.5"
            />
          </svg>
          Sign out
        </button>
      </div>
    </nav>

    <!--
      tabindex="-1" so the skip link can put focus here. Without it the
      browser scrolls to the anchor but leaves focus on the link, and the
      next Tab goes straight back into the drawer.
    -->
    <main id="content" tabindex="-1" class="outline-none lg:pl-60">
      <router-outlet />
    </main>
  `,
})
export class Shell {
  protected readonly session = inject(SessionStore);
  protected readonly queue = inject(OfflineQueue);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);

  /**
   * An href jump alone moves the viewport but not focus. Doing it by hand
   * also avoids pushing a `#content` entry into history, which on a PWA with
   * no browser chrome would cost the user a back press to undo.
   */
  protected focusContent(event: Event): void {
    event.preventDefault();
    document.getElementById('content')?.focus();
  }

  protected readonly items: NavItem[] = [
    { path: '/today', label: 'Today', icon: 'M5 5h14v14H5zM5 9h14M9 13h6' },
    { path: '/upcoming', label: 'Upcoming', icon: 'M4 7h16M4 12h10M4 17h6M16 15l2.5 2.5L22 14' },
    {
      path: '/calendar',
      label: 'Calendar',
      icon: 'M5 6h14v13H5zM5 10h14M8 4v3M16 4v3M9 14h1M13 14h1M9 17h1M13 17h1',
    },
    { path: '/reporting', label: 'Reporting', icon: 'M5 19V9M10 19V5M15 19v-6M20 19v-9' },
  ];

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
