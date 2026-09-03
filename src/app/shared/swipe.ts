import { Directive, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { prefersReducedMotion } from '../core/view-transition';
import { COMMIT_PX, ENGAGE_PX, RESISTANCE, SNAP_BACK_MS } from './swipe.constants';

export type SwipeDirection = 'left' | 'right';

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
 *
 * **The inline transition is `none` while dragging, not the empty string.**
 * An empty value removes the inline property, which hands the row back to
 * whatever its class says — and the row carries Tailwind's `transition`
 * shorthand, which includes `transform` at 150ms. Every pointermove then
 * *animated* toward the new offset and the next move restarted it 16ms later,
 * so the row lagged the thumb and juddered the whole way. Seen on an iPhone,
 * 22 Aug. Anything that drives `transform` from a pointer has to say `none`.
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
    // translate3d, not translateX: it promotes the row to its own compositor
    // layer, so the drag never repaints the card, its shadow or its ring.
    '[style.transform]': 'offset() ? "translate3d(" + offset() + "px,0,0)" : ""',
    '[style.transition]': 'transitionStyle()',
    '[style.will-change]': 'dragging() ? "transform" : ""',
  },
})
export class Swipe {
  /** A finished row has nothing to swipe to. See {@link onDown}. */
  readonly disabled = input(false, { alias: 'appSwipeDisabled' });

  readonly swiped = output<SwipeDirection>();

  /** Live horizontal offset in px. The row renders its backing from this. */
  readonly offset = signal(0);
  /** True once past the commit point, so the backing can show it will fire. */
  readonly armed = signal(false);

  /** True between engaging and release. Drives `none`, and the layer hint. */
  protected readonly dragging = signal(false);
  protected readonly settling = signal(false);

  /**
   * Three states, and only the middle one belongs to the class: pinned to the
   * thumb, snapping back, or idle and transitioning like any other row.
   */
  protected readonly transitionStyle = computed(() => {
    if (this.dragging()) return 'none';
    if (this.settling()) return `transform ${SNAP_BACK_MS}ms ease-out`;
    return '';
  });

  private readonly host = inject(ElementRef<HTMLElement>);

  private startX = 0;
  private startY = 0;
  private pointerId: number | null = null;
  private engaged = false;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  protected onDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || this.disabled()) return;
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
      this.dragging.set(true);
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
    // Order matters: dragging has to drop before settling is read, or the
    // computed would still say `none` and the row would jump home instead of
    // travelling.
    this.dragging.set(false);
    this.settling.set(!prefersReducedMotion());
    this.offset.set(0);

    // Hand the row back to its own class once it is home. Leaving the inline
    // shorthand in place would keep overriding every other transition the row
    // has — its ring and shadow on hover included.
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settling.set(false);
      this.settleTimer = null;
    }, SNAP_BACK_MS);
  }
}

/** Linear to the commit point, then heavily damped, so the end has a wall. */
function resist(dx: number): number {
  const magnitude = Math.abs(dx);
  if (magnitude <= COMMIT_PX) return dx;
  const past = (magnitude - COMMIT_PX) * RESISTANCE;
  return Math.sign(dx) * (COMMIT_PX + past);
}
