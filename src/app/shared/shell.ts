import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SessionStore } from '../core/session.store';
import { OfflineQueue } from '../core/offline-queue';
import { Nav } from '../core/nav';
import { InstallHint } from './install-hint';

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, InstallHint],
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
      class="skip-link rounded-card bg-ink-900 px-4 py-2 text-body font-medium text-white"
      (click)="focusContent($event)"
    >
      Skip to content
    </a>

    <!-- mobile bar -->
    <div
      class="safe-py-2 sticky top-0 z-30 flex items-center gap-2 bg-white/80 px-2 backdrop-blur lg:hidden"
    >
      <button
        type="button"
        class="grid h-10 w-10 place-items-center rounded-card text-ink-600 transition hover:bg-ink-100"
        aria-label="Open the menu"
        [attr.aria-expanded]="menuOpen()"
        (click)="menuOpen.set(true)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="h-5 w-5"
          aria-hidden="true"
        >
          <path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <span class="text-body font-semibold tracking-tight">Daybook</span>
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
      class="safe-py-4 fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-ink-200/70 bg-ink-50 px-3 transition-transform duration-200"
      [class]="navClass()"
      aria-label="Main"
    >
      <div class="flex items-center justify-between gap-2 px-3 pb-3">
        <p class="text-body font-semibold tracking-tight">Daybook</p>

        <!--
          Collapse lives at the drawer's top right, where the thing it acts on
          is the thing it sits inside. Desktop only: below lg the drawer is an
          overlay sheet that the scrim and Escape already close, and a second
          way to dismiss it would just be a smaller tap target for the same
          job.
        -->
        <button
          type="button"
          class="hidden h-8 w-8 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 lg:grid"
          aria-label="Collapse the sidebar"
          (click)="nav.toggleCollapsed()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              fill-rule="evenodd"
              d="M19 4.001H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-12a2 2 0 0 0-2-2m-15 2a1 1 0 0 1 1-1h4v14H5a1 1 0 0 1-1-1zm6 13h9a1 1 0 0 0 1-1v-12a1 1 0 0 0-1-1h-9z"
              clip-rule="evenodd"
            ></path>
          </svg>
        </button>
      </div>

      <!--
        Add task sits above the destinations, not among them: it is the only
        thing here that does something rather than going somewhere. It is also
        the app's primary action, and it used to be a button in Today's header
        — which meant it did not exist on any other page.

        It closes the sheet itself rather than leaving that to the navigation
        handler below. Pressed on a phone while already on Today, the router
        does not move and no NavigationEnd fires, so the sheet would stay up
        covering the composer it had just opened.
      -->
      <button
        type="button"
        class="mb-3 flex w-full items-center gap-3 rounded-card px-3 py-2 text-body font-semibold text-brand-700 transition hover:bg-brand-50"
        (click)="menuOpen.set(false); nav.openComposer()"
      >
        <span
          class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-600 text-white"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.6"
            class="h-3 w-3"
          >
            <path stroke-linecap="round" d="M12 5v14M5 12h14" />
          </svg>
        </span>
        Add task
      </button>

      @if (queue.pending(); as waiting) {
        <p
          class="mx-1 mb-2 rounded-control bg-quick-100 px-2 py-1 text-caption font-medium text-quick-700"
          aria-live="polite"
        >
          {{ waiting }} change{{ waiting === 1 ? '' : 's' }} waiting to sync
        </p>
      }

      <ul class="flex flex-1 flex-col gap-1">
        @for (item of items; track item.path) {
          <li>
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-brand-50 text-brand-700"
              #active="routerLinkActive"
              class="flex items-center gap-3 rounded-card px-3 py-2 text-body font-medium transition"
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
          class="flex items-center gap-3 rounded-card px-3 py-2 text-body font-medium transition"
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
          class="flex w-full items-center gap-3 rounded-card px-3 py-2 text-body font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
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
    <!--
      The way back in. It only exists while the drawer is folded away, and it
      is placed rather than inlined into a page header because there are five
      pages and they would each need their own copy. The content column is
      centred in a max-w-2xl column, so the top-left of the wide area is
      empty at
      every width this button appears at.
    -->
    @if (nav.collapsed()) {
      <button
        type="button"
        class="fixed left-2 top-2 z-30 hidden h-9 w-9 place-items-center rounded-card bg-white text-ink-500 shadow-sm ring-1 ring-ink-200/70 transition hover:text-ink-900 lg:grid"
        aria-label="Expand the sidebar"
        (click)="nav.toggleCollapsed()"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            fill-rule="evenodd"
            d="M19 4.001H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-12a2 2 0 0 0-2-2m-15 2a1 1 0 0 1 1-1h4v14H5a1 1 0 0 1-1-1zm6 13h9a1 1 0 0 0 1-1v-12a1 1 0 0 0-1-1h-9z"
            clip-rule="evenodd"
          ></path>
        </svg>
      </button>
    }

    <main
      id="content"
      tabindex="-1"
      class="outline-none transition-[padding] duration-200"
      [class]="nav.collapsed() ? 'lg:pl-0' : 'lg:pl-60'"
    >
      <!--
        In the flow above the outlet, not floating: the composer and the toasts
        both own the bottom of the viewport, and a banner that overlapped
        either would be worse than no banner. Renders itself only on an iOS
        browser that is not already the installed app.
      -->
      <div class="px-4">
        <app-install-hint />
      </div>
      <router-outlet />
    </main>
  `,
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
