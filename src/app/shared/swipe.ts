import { Directive, ElementRef, inject, output, signal } from '@angular/core';
import { prefersReducedMotion } from '../core/view-transition';

export type SwipeDirection = 'left' | 'right';

/**
 * How far a row has to travel before the action commits, in px.
 *
 * **These four numbers are unvalidated.** BUILD-PLAN blocks swipe on Todoist
 * iOS captures that were never taken, and they are what would settle the
 * feel — how far Todoist makes you drag, whether it fires on release or on
 * crossing, how much it resists. Until those exist these are reasoned
 * defaults, not measured ones, and they are gathered here rather than
 * scattered through the code so replacing them is a one-place edit.
 */
const COMMIT_PX = 96;
/** Horizontal intent: past this, the gesture is a swipe and not a scroll. */
const ENGAGE_PX = 12;
/** Past the commit point the row keeps moving, but at a fifth of the speed. */
const RESISTANCE = 0.2;
const SNAP_BACK_MS = 180;

/**
 * Swipe right to complete, left to reschedule. Touch only.
 *
 * Deliberately does nothing for a mouse or a trackpad: on a desktop the row
 * already has a checkbox and a push button, and a click-drag that mutates data
 * is a trap next to a text selection.
 *
 * The direction lock is the fiddly part. A list is scrolled vertically far
 * more often than it is swiped, so the gesture stays inert until the pointer
 * has moved {@link ENGAGE_PX} horizontally *and* more horizontally than
 * vertically. `touch-action: pan-y` on the host means the browser keeps
 * ownership of vertical scrolling and never waits on this code to decide.
 */
@Directive({
  selector: '[appSwipe]',
  exportAs: 'appSwipe',
  host: {
    '[style.touch-action]': "'pan-y'",
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'onCancel($event)',
    '[style.transform]': 'offset() ? "translateX(" + offset() + "px)" : ""',
    '[style.transition]': 'settling() ? "transform ' + SNAP_BACK_MS + 'ms ease-out" : ""',
  },
})
export class Swipe {
  readonly swiped = output<SwipeDirection>();

  /** Live horizontal offset in px. The row renders its backing from this. */
  readonly offset = signal(0);
  /** True once past the commit point, so the backing can show it will fire. */
  readonly armed = signal(false);

  protected readonly settling = signal(false);

  private readonly host = inject(ElementRef<HTMLElement>);

  private startX = 0;
  private startY = 0;
  private pointerId: number | null = null;
  private engaged = false;

  protected onDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.engaged = false;
    this.settling.set(false);
  }

  protected onMove(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) return;

    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;

    if (!this.engaged) {
      // Vertical wins ties. A near-45° drag on a scrolling list is almost
      // always someone scrolling badly, not swiping precisely.
      if (Math.abs(dx) < ENGAGE_PX || Math.abs(dx) <= Math.abs(dy)) return;
      this.engaged = true;
      // Now that this is a swipe, stop the browser handing the same pointer
      // to anything else — including the row's own link.
      this.host.nativeElement.setPointerCapture(event.pointerId);
    }

    this.offset.set(resist(dx));
    this.armed.set(Math.abs(dx) >= COMMIT_PX);
  }

  protected onUp(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) return;
    const committed = this.armed();
    const direction: SwipeDirection = this.offset() > 0 ? 'right' : 'left';

    this.reset();
    // Fires on release rather than on crossing the threshold, so the gesture
    // can be backed out of. An action that fires mid-drag cannot be.
    if (committed) this.swiped.emit(direction);
  }

  protected onCancel(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) return;
    this.reset();
  }

  private reset(): void {
    this.pointerId = null;
    this.engaged = false;
    this.armed.set(false);
    this.settling.set(!prefersReducedMotion());
    this.offset.set(0);
  }
}

/** Linear to the commit point, then heavily damped, so the end has a wall. */
function resist(dx: number): number {
  const magnitude = Math.abs(dx);
  if (magnitude <= COMMIT_PX) return dx;
  const past = (magnitude - COMMIT_PX) * RESISTANCE;
  return Math.sign(dx) * (COMMIT_PX + past);
}
