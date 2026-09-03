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
import { FOCUSABLE } from './today.constants';

/**
 * The composer: capture lifted off the page as a modal dialog, opened by an
 * `Add task` button with explicit cancel and commit.
 *
 * **A centred dialog on a desktop, a bottom sheet on a phone.** Both are the
 * same modal — scrim, Escape, explicit Cancel, trapped Tab — differing only in
 * where the box sits. On a phone the bottom edge is where the thumb already
 * is (BUILD-PLAN §10); on a desktop there is no thumb, and the centre is where
 * a dialog belongs.
 *
 * It was briefly inline in the list, matching Todoist, and that was wrong
 * here — see §9, 3 Sep. Todoist's rows are cards; Daybook's are flat with a
 * hairline between, so an inline card of roughly row width read as one more
 * task rather than as a box for writing one.
 *
 * The dialog centres on the **viewport**, not on the content column, and so
 * carries no sidebar inset at all. A modal is not part of the page behind it,
 * which is what lets this file stay out of the drawer-collapse problem that
 * `toasts.ts` still has to track.
 *
 * `day` presets the date chip, which is what the per-day `+ Add task` rows in
 * Upcoming use to schedule by position rather than by typing a weekday.
 */
@Component({
  selector: 'app-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Capture],
  host: {
    '(keydown)': 'onKeydown($event)',
  },
  templateUrl: './composer.html',
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
