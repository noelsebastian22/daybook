import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Capture, type CaptureSeed, type CaptureSubmit } from './capture';

/**
 * Everything that can hold focus. `[tabindex]` is filtered by value below
 * rather than by selector, because the scrim and the popover backdrop are
 * both real buttons parked at -1.
 */
const FOCUSABLE = 'a[href],button,input,textarea,select,[tabindex]';

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
 *
 * It is modal — a scrim, Escape and an explicit Cancel — so it traps Tab. The
 * page behind is dimmed but was still fully tabbable, which walked a keyboard
 * user out into a list they could not see they had reached.
 */
@Component({
  selector: 'app-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Capture],
  host: {
    '(keydown)': 'onKeydown($event)',
  },
  template: `
    <!-- scrim and click-outside target; a button so Escape and focus behave -->
    <button
      type="button"
      class="fixed inset-0 z-40 cursor-default bg-ink-900/20"
      tabindex="-1"
      aria-label="Close the composer"
      (click)="cancelled.emit()"
    ></button>

    <!--
      lg:left-60 clears the 240px sidebar. Without it inset-x-0 centres the box
      on the viewport while the list it belongs to is centred in the space
      beside the sidebar, putting the two 120px apart on desktop.
    -->
    <div
      #panel
      class="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:left-60"
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

  private readonly panel = viewChild.required<ElementRef<HTMLDivElement>>('panel');

  /**
   * Wraps Tab at both ends of the panel. An open popover renders inside it, so
   * its options join the cycle for as long as it is open without any extra
   * bookkeeping here.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;

    const root = this.panel().nativeElement;
    const stops = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0 && el.getClientRects().length > 0,
    );
    if (stops.length === 0) return;

    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    const leaving = event.shiftKey ? active === first : active === last;

    // Focus outside the panel means the browser has already walked off it, so
    // both directions come home rather than only the edge case.
    if (leaving || !root.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }
}
