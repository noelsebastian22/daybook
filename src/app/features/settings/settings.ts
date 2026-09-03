import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SettingsStore } from '../../core/settings.store';
import { TaskStore } from '../../core/task.store';
import { ToastStore } from '../../core/toast.store';
import { Push, type PushBlocker } from '../../core/push';
import { browserTimezone } from '../../core/dates';
import type { Category } from '../../core/models';
import { BLOCKER_TEXT, TIMEZONES } from './settings.data';

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
  templateUrl: './settings.html',
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
    // Separate from ensureLoaded because it answers a different question:
    // ensureLoaded fetches the user's row, this asks whether the browser in
    // front of us is one of their registered devices. Only Settings renders
    // the toggle, so only Settings pays for it.
    void this.settings.loadPush();
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
        // The store owns the whole registration now: prompt, RPC and
        // rollback. It reports its own failure, so a false here is already
        // explained on screen.
        if (await this.settings.subscribePush()) {
          this.toast.show('Reminders on for this device.');
        }
      } else {
        await this.settings.unsubscribePush();
      }
    } finally {
      this.busy.set(false);
    }
  }
}
