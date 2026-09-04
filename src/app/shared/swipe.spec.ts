import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { render } from '../../testing/render';
import { Swipe, type SwipeDirection } from './swipe';
import { COMMIT_PX, ENGAGE_PX, RESISTANCE, SNAP_BACK_MS } from './swipe.constants';

/**
 * The gesture's contract: touch only, direction-locked, and committed on
 * release so it can be backed out of. Everything here drives real
 * `PointerEvent`s at the host rather than calling the handlers, because the
 * pointer type and the id matching are half of what the directive does.
 */

@Component({
  selector: 'app-swipe-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Swipe],
  template: `
    <div appSwipe data-testid="row" [appSwipeDisabled]="disabled()" (swiped)="record($event)">
      call physio
    </div>
  `,
})
class SwipeHost {
  readonly disabled = input(false);
  readonly seen = signal<SwipeDirection[]>([]);

  record(direction: SwipeDirection): void {
    this.seen.update((all) => [...all, direction]);
  }
}

interface PointerBits {
  x?: number;
  y?: number;
  id?: number;
  pointerType?: string;
}

function pointer(type: string, { x = 0, y = 0, id = 1, pointerType = 'touch' }: PointerBits = {}) {
  return new PointerEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: y,
    pointerId: id,
    pointerType,
  });
}

async function renderHost(disabled = false) {
  const rendered = await render(SwipeHost, { inputs: { disabled } });
  const row = rendered.query('[data-testid="row"]') as HTMLElement;
  // jsdom has no pointer capture. The directive calls it the moment a gesture
  // engages, so without this stub every test would fail on the same TypeError
  // rather than on its own assertion.
  row.setPointerCapture = () => {};
  row.releasePointerCapture = () => {};
  return { ...rendered, row };
}

describe('Swipe', () => {
  let host: Awaited<ReturnType<typeof renderHost>>;

  beforeEach(async () => {
    host = await renderHost();
  });

  it('hands vertical scrolling back to the browser', async () => {
    expect(host.row.style.touchAction).toBe('pan-y');
  });

  it('completes on a drag to the right past the commit point', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX + 10 }));
    host.row.dispatchEvent(pointer('pointerup', { x: COMMIT_PX + 10 }));
    await host.settle();

    expect(host.component.seen()).toEqual(['right']);
  });

  it('reschedules on a drag to the left past the commit point', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 200 }));
    host.row.dispatchEvent(pointer('pointermove', { x: 200 - COMMIT_PX - 10 }));
    host.row.dispatchEvent(pointer('pointerup', { x: 200 - COMMIT_PX - 10 }));
    await host.settle();

    expect(host.component.seen()).toEqual(['left']);
  });

  it('fires on release, not on crossing the threshold', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX + 40 }));
    await host.settle();

    expect(host.component.seen()).toEqual([]);

    host.row.dispatchEvent(pointer('pointerup', { x: COMMIT_PX + 40 }));
    await host.settle();

    expect(host.component.seen()).toEqual(['right']);
  });

  it('lets a gesture be backed out of before release', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX + 40 }));
    host.row.dispatchEvent(pointer('pointermove', { x: 20 }));
    host.row.dispatchEvent(pointer('pointerup', { x: 20 }));
    await host.settle();

    expect(host.component.seen()).toEqual([]);
  });

  it('does nothing for a mouse, which has a checkbox and a button beside it', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0, pointerType: 'mouse' }));
    host.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX + 40, pointerType: 'mouse' }));
    host.row.dispatchEvent(pointer('pointerup', { x: COMMIT_PX + 40, pointerType: 'mouse' }));
    await host.settle();

    expect(host.component.seen()).toEqual([]);
    expect(host.row.style.transform).toBe('');
  });

  it('does nothing on a finished row', async () => {
    const off = await renderHost(true);
    off.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    off.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX + 40 }));
    off.row.dispatchEvent(pointer('pointerup', { x: COMMIT_PX + 40 }));
    await off.settle();

    expect(off.component.seen()).toEqual([]);
  });

  it('ignores a vertical drag, because a list is scrolled far more often than swiped', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0, y: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX, y: COMMIT_PX + 40 }));
    host.row.dispatchEvent(pointer('pointerup', { x: COMMIT_PX, y: COMMIT_PX + 40 }));
    await host.settle();

    expect(host.component.seen()).toEqual([]);
    expect(host.row.style.transform).toBe('');
  });

  it('gives a tie to the scroll rather than to the swipe', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0, y: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX + 40, y: COMMIT_PX + 40 }));
    await host.settle();

    expect(host.row.style.transform).toBe('');
  });

  it('stays inert until the pointer has travelled the engage distance', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: ENGAGE_PX - 1 }));
    await host.settle();

    expect(host.row.style.transform).toBe('');
  });

  it('abandons the gesture when the pointer is cancelled', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX + 40 }));
    host.row.dispatchEvent(pointer('pointercancel', { x: COMMIT_PX + 40 }));
    await host.settle();

    expect(host.component.seen()).toEqual([]);
    expect(host.row.style.transform).toBe('');
  });

  it('ignores a second pointer that never went down on this row', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0, id: 1 }));
    host.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX + 40, id: 2 }));
    host.row.dispatchEvent(pointer('pointerup', { x: COMMIT_PX + 40, id: 2 }));
    await host.settle();

    expect(host.component.seen()).toEqual([]);
  });

  it('damps travel past the commit point instead of tracking the thumb one to one', async () => {
    const overshoot = 100;
    host.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX + overshoot }));
    await host.settle();

    const expected = COMMIT_PX + overshoot * RESISTANCE;
    expect(host.row.style.transform).toBe(`translate3d(${expected}px,0,0)`);
  });

  it('tracks the thumb one to one up to the commit point', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: 40 }));
    await host.settle();

    expect(host.row.style.transform).toBe('translate3d(40px,0,0)');
  });

  it('pins the row to the thumb with transition none, never an empty value', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: 40 }));
    await host.settle();

    // An empty string would hand the row back to Tailwind's `transition`
    // shorthand, which animates transform and made the drag judder.
    expect(host.row.style.transition).toBe('none');
  });

  it('travels home on release rather than jumping', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: 40 }));
    host.row.dispatchEvent(pointer('pointerup', { x: 40 }));
    await host.settle();

    expect(host.row.style.transition).toBe(`transform ${SNAP_BACK_MS}ms ease-out`);
    expect(host.row.style.transform).toBe('');
  });

  it('arms exactly at the commit point', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX }));
    host.row.dispatchEvent(pointer('pointerup', { x: COMMIT_PX }));
    await host.settle();

    expect(host.component.seen()).toEqual(['right']);
  });

  it('does not fire when released exactly one pixel short of the commit point', async () => {
    host.row.dispatchEvent(pointer('pointerdown', { x: 0 }));
    host.row.dispatchEvent(pointer('pointermove', { x: COMMIT_PX - 1 }));
    host.row.dispatchEvent(pointer('pointerup', { x: COMMIT_PX - 1 }));
    await host.settle();

    expect(host.component.seen()).toEqual([]);
  });
});
