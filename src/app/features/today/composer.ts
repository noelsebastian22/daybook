import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Capture, type CaptureSeed, type CaptureSubmit } from './capture';

/**
 * The floating composer: capture lifted off the page and over the list,
 * opened by an `Add task` button with explicit cancel and commit.
 *
 * Replaced the always-visible box at the top of Today, and the Magic Plus
 * draggable FAB before that (BUILD-PLAN §10). It anchors to the bottom of the
 * viewport at every width — on a phone that is where the thumb already is,
 * and on a desktop it keeps the list from jumping when the box opens.
 *
 * `day` presets the date chip, which is what the per-day `+ Add task` rows in
 * Upcoming use to schedule by position rather than by typing a weekday.
 */
@Component({
  selector: 'app-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Capture],
  template: `
    <!-- scrim and click-outside target; a button so Escape and focus behave -->
    <button
      type="button"
      class="fixed inset-0 z-40 cursor-default bg-ink-900/20"
      tabindex="-1"
      aria-label="Close the composer"
      (click)="cancelled.emit()"
    ></button>

    <div
      class="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div class="mx-auto max-w-2xl">
        <app-capture
          [seed]="seed()"
          [actions]="true"
          [autoFocus]="true"
          (submitted)="submitted.emit($event)"
          (cancelled)="cancelled.emit()"
        />
      </div>
    </div>
  `,
})
export class Composer {
  /** Preset day for the date chip. Null lets the text decide, as capture does. */
  readonly day = input<string | null>(null);

  readonly submitted = output<CaptureSubmit>();
  readonly cancelled = output<void>();

  protected readonly seed = computed<CaptureSeed | null>(() => {
    const day = this.day();
    return day ? { text: '', scheduling: { scheduled_date: day, reminder_at: null } } : null;
  });
}
