import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { SettingsStore } from '../../core/settings.store';
import { TaskStore } from '../../core/task.store';
import { ToastStore } from '../../core/toast.store';
import { Push, type PushBlocker } from '../../core/push';
import { browserTimezone } from '../../core/dates';
import type { Category } from '../../core/models';

/** A short list beats a 400-entry <select> nobody scrolls. */
const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Pacific/Auckland',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

const BLOCKER_TEXT: Record<Exclude<PushBlocker, null>, string> = {
  unconfigured: 'Push is not configured on this build yet.',
  'no-service-worker': 'Reminders need the installed app. They are off in development builds.',
  'not-installed': 'Add Daybook to your home screen first. iOS only allows reminders there.',
  denied: 'Notifications are blocked for Daybook in your browser settings.',
};

/**
 * Settings: the digest, the timezone the server sends it in, categories, and
 * reminders.
 *
 * The timezone matters more than it looks. Rollover runs on the client's local
 * date, but the digest runs on a server cron that has no idea where Noel is,
 * so `user_settings.timezone` is the only thing telling it when 7am is. It was
 * an unread column until this page existed.
 */
@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto min-h-dvh max-w-2xl px-4 pb-24">
      <header class="safe-top py-6">
        <p class="text-xs font-medium uppercase tracking-wider text-ink-400">Settings</p>
        <h1 class="mt-0.5 text-2xl font-semibold tracking-tight">Preferences</h1>
      </header>

      @if (settings.settings(); as s) {
        <!-- digest -->
        <section class="rounded-panel bg-white p-4 shadow-sm ring-1 ring-ink-200/60">
          <h2 class="text-sm font-semibold tracking-tight">Daily digest</h2>
          <p class="mt-0.5 text-xs text-ink-400">
            What you finished yesterday and what is on today, by email.
          </p>

          <label class="mt-3 flex items-center justify-between gap-4">
            <span class="text-sm">Send me the digest</span>
            <input
              type="checkbox"
              class="h-5 w-9 shrink-0 appearance-none rounded-full bg-ink-200 transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-brand-600 checked:before:translate-x-[1.125rem]"
              [checked]="s.digest_enabled"
              (change)="setDigest($event)"
            />
          </label>

          @if (s.digest_enabled) {
            <label class="mt-3 flex items-center justify-between gap-4">
              <span class="text-sm">Send at</span>
              <input
                type="time"
                class="rounded-control bg-ink-50 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                [value]="sendAt()"
                (change)="setSendAt($event)"
              />
            </label>
          }
        </section>

        <!-- timezone -->
        <section class="mt-4 rounded-panel bg-white p-4 shadow-sm ring-1 ring-ink-200/60">
          <h2 class="text-sm font-semibold tracking-tight">Timezone</h2>
          <p class="mt-0.5 text-xs text-ink-400">
            When the server thinks your day starts. Your device says
            {{ detectedZone }}.
          </p>

          <!--
            The selection lives on the <option>, not as [value] on the <select>.
            A [value] binding on the select runs before @for has rendered the
            options, so the assignment finds no matching child and the element
            falls back to selectedIndex 0 — which, because zones() is sorted,
            is America/Los_Angeles. It renders a zone the user never chose.
          -->
          <select
            class="mt-3 w-full rounded-control bg-ink-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Timezone"
            (change)="setTimezone($event)"
          >
            @for (zone of zones(); track zone) {
              <option [value]="zone" [selected]="zone === s.timezone">{{ zone }}</option>
            }
          </select>

          @if (s.timezone !== detectedZone) {
            <button
              type="button"
              class="mt-2 text-xs font-medium text-brand-700 transition hover:text-brand-600"
              (click)="settings.update({ timezone: detectedZone })"
            >
              Use {{ detectedZone }}
            </button>
          }
        </section>

        <!-- reminders -->
        <section class="mt-4 rounded-panel bg-white p-4 shadow-sm ring-1 ring-ink-200/60">
          <h2 class="text-sm font-semibold tracking-tight">Reminders</h2>
          <p class="mt-0.5 text-xs text-ink-400">
            A push when a task's reminder time arrives.
          </p>

          @if (blocker(); as reason) {
            <p class="mt-3 rounded-control bg-ink-50 px-3 py-2 text-xs text-ink-600">
              {{ blockerText(reason) }}
            </p>
          } @else {
            <label class="mt-3 flex items-center justify-between gap-4">
              <span class="text-sm">Push reminders on this device</span>
              <input
                type="checkbox"
                class="h-5 w-9 shrink-0 appearance-none rounded-full bg-ink-200 transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-brand-600 checked:before:translate-x-[1.125rem]"
                [checked]="!!s.push_subscription"
                [disabled]="busy()"
                (change)="togglePush($event)"
              />
            </label>
          }
        </section>

        <!-- categories -->
        <section class="mt-4 rounded-panel bg-white p-4 shadow-sm ring-1 ring-ink-200/60">
          <h2 class="text-sm font-semibold tracking-tight">Categories</h2>
          <p class="mt-0.5 text-xs text-ink-400">
            Typing a new <code class="text-[11px]">#tag</code> creates one. Deleting a
            category leaves its tasks untagged, not deleted.
          </p>

          <ul class="mt-3 divide-y divide-ink-100">
            @for (c of tasks.categories(); track c.id) {
              <li class="flex items-center gap-3 py-2">
                <input
                  type="color"
                  class="h-7 w-7 shrink-0 cursor-pointer rounded-control border-0 bg-transparent p-0"
                  [value]="c.colour"
                  [attr.aria-label]="'Colour for ' + c.name"
                  (change)="setColour(c, $event)"
                />
                <input
                  type="text"
                  class="min-w-0 flex-1 rounded-control bg-transparent px-2 py-1 text-sm outline-none focus:bg-ink-50 focus:ring-2 focus:ring-brand-500"
                  [value]="c.name"
                  [attr.aria-label]="'Name for ' + c.name"
                  (change)="setName(c, $event)"
                />
                <span class="shrink-0 text-[11px] text-ink-400">#{{ c.slug }}</span>
                <button
                  type="button"
                  class="shrink-0 rounded-control px-2 py-1 text-xs font-medium text-late-700 transition hover:bg-late-100"
                  [attr.aria-label]="'Delete ' + c.name"
                  (click)="tasks.removeCategory(c)"
                >
                  Delete
                </button>
              </li>
            } @empty {
              <li class="py-2 text-sm text-ink-400">No categories yet.</li>
            }
          </ul>
        </section>
      } @else {
        <div class="h-32 animate-pulse rounded-panel bg-ink-100"></div>
      }
    </div>
  `,
})
export class Settings {
  protected readonly settings = inject(SettingsStore);
  protected readonly tasks = inject(TaskStore);
  private readonly toast = inject(ToastStore);
  private readonly push = inject(Push);

  protected readonly detectedZone = browserTimezone();
  protected readonly busy = signal(false);

  /** The device's zone is pinned on even when it is not in the shortlist. */
  protected readonly zones = computed(() => {
    const current = this.settings.settings()?.timezone;
    const all = new Set([...TIMEZONES, this.detectedZone]);
    if (current) all.add(current);
    return [...all].sort();
  });

  /** Postgres `time` comes back as HH:MM:SS; an <input type="time"> wants HH:MM. */
  protected readonly sendAt = computed(() =>
    (this.settings.settings()?.digest_send_at ?? '07:00').slice(0, 5),
  );

  protected readonly blocker = computed(() => this.push.blocker());

  constructor() {
    void this.settings.ensureLoaded();
    void this.tasks.ensureLoaded();
  }

  protected blockerText(reason: Exclude<PushBlocker, null>): string {
    return BLOCKER_TEXT[reason];
  }

  protected setDigest(event: Event): void {
    void this.settings.update({ digest_enabled: (event.target as HTMLInputElement).checked });
  }

  protected setSendAt(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) void this.settings.update({ digest_send_at: value });
  }

  protected setTimezone(event: Event): void {
    void this.settings.update({ timezone: (event.target as HTMLSelectElement).value });
  }

  protected setColour(category: Category, event: Event): void {
    void this.tasks.updateCategory(category, {
      colour: (event.target as HTMLInputElement).value,
    });
  }

  protected setName(category: Category, event: Event): void {
    const name = (event.target as HTMLInputElement).value.trim();
    if (name && name !== category.name) void this.tasks.updateCategory(category, { name });
  }

  /**
   * The browser prompt is the slow part and there is no optimistic version of
   * it — the switch cannot flip before the user has answered. This is the one
   * write in the app that waits, and the disabled state says so.
   */
  protected async togglePush(event: Event): Promise<void> {
    const wanted = (event.target as HTMLInputElement).checked;
    this.busy.set(true);
    try {
      if (wanted) {
        const subscription = await this.push.subscribe();
        if (!subscription) {
          this.toast.error('Reminders were not turned on.');
          return;
        }
        await this.settings.update({ push_subscription: subscription });
        this.toast.show('Reminders on for this device.');
      } else {
        await this.push.unsubscribe();
        await this.settings.update({ push_subscription: null });
      }
    } finally {
      this.busy.set(false);
    }
  }
}
