import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Install } from '../core/install';

/**
 * How to add Daybook to the iOS home screen.
 *
 * iOS is the only platform that offers no install affordance at all — no
 * `beforeinstallprompt`, no address-bar button, nothing but an entry partway
 * down the Share sheet. Noel could not find it on 22 Aug and it had to be
 * talked through; this is that conversation, in the app.
 *
 * The Share glyph is drawn inline in the sentence rather than named, because
 * "tap Share" is exactly the instruction that already failed — the control is
 * an icon with no label, and the icon is the part you have to recognise.
 *
 * It sits in the flow at the top of the page instead of floating, so it can
 * never land on top of the composer or the toasts, both of which are pinned to
 * the bottom of the viewport.
 */
@Component({
  selector: 'app-install-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (install.shouldHint()) {
      <aside
        class="mx-auto mt-4 max-w-2xl rounded-panel bg-white px-4 py-3 shadow-sm ring-1 ring-ink-200/70"
        aria-labelledby="install-hint-title"
      >
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <p id="install-hint-title" class="text-body font-semibold text-ink-900">
              Add Daybook to your Home Screen
            </p>

            <p class="mt-1 text-body text-ink-400">
              Tap
              <span
                class="mx-0.5 inline-flex h-6 w-6 -translate-y-0.5 items-center justify-center rounded-control bg-ink-100 align-middle text-ink-600"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  class="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 3.5v11" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.5 7 12 3.5 15.5 7" />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M7.5 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-1.5"
                  />
                </svg>
              </span>
              <span class="sr-only">Share</span>
              in the browser toolbar, then choose
              <span class="font-medium text-ink-600">Add to Home Screen</span>.
            </p>

            <!--
              The reason, not a feature list. Reminders genuinely cannot work
              from a tab on iOS, and an uninstalled site can lose its cached
              storage after about a week — which is where the offline queue
              lives. Someone who knows that will bother.
            -->
            <p class="mt-2 text-caption text-ink-400">
              Reminders only work from the installed app, and installing keeps
              anything saved offline from being cleared.
            </p>
          </div>

          <button
            type="button"
            class="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
            aria-label="Dismiss the install hint"
            (click)="install.dismiss()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </aside>
    }
  `,
})
export class InstallHint {
  protected readonly install = inject(Install);
}
