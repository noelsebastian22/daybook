import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { render, type Rendered } from '../../testing/render';
import { Popover } from './popover';

/**
 * The popover owns dismissal and nothing else. The backdrop is a real button
 * rather than a document listener, because a listener added while the opening
 * click is still bubbling closes the panel on the click that opened it.
 */

@Component({
  selector: 'app-popover-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Popover],
  template: `
    <app-popover [label]="label()" [dismissLabel]="dismissLabel()" (closed)="closed = closed + 1">
      <button type="button">Health</button>
      <button type="button">Admin</button>
    </app-popover>
  `,
})
class PopoverHost {
  readonly label = input('Choose a category');
  readonly dismissLabel = input('Close the category list');
  closed = 0;
}

async function renderPopover(inputs: Record<string, unknown> = {}): Promise<Rendered<PopoverHost>> {
  return render(PopoverHost, { inputs });
}

describe('Popover', () => {
  it('is a dialog named by whoever opened it', async () => {
    const host = await renderPopover();
    expect(host.query('[role="dialog"]')?.getAttribute('aria-label')).toBe('Choose a category');
  });

  it('projects the options it was given', async () => {
    const host = await renderPopover();
    expect(host.byText('button', 'Health')).not.toBeNull();
    expect(host.byText('button', 'Admin')).not.toBeNull();
  });

  it('names its backdrop for what dismissing it means', async () => {
    const host = await renderPopover();
    const backdrop = host.queryAll('button')[0];
    expect(backdrop.getAttribute('aria-label')).toBe('Close the category list');
  });

  it('falls back to a plain label when the caller gives none', async () => {
    // Rendered bare: a host binding would pass its own value through and the
    // default would never be reached.
    const bare = await render(Popover, { inputs: { label: 'Choose a category' } });
    expect(bare.queryAll('button')[0].getAttribute('aria-label')).toBe('Close');
  });

  it('closes when the backdrop is pressed', async () => {
    const host = await renderPopover();
    await host.click(host.queryAll('button')[0]);

    expect(host.component.closed).toBe(1);
  });

  it('closes on Escape', async () => {
    const host = await renderPopover();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await host.settle();

    expect(host.component.closed).toBe(1);
  });

  it('keeps the backdrop out of the tab order, since Escape is the keyboard way out', async () => {
    const host = await renderPopover();
    expect(host.queryAll('button')[0].tabIndex).toBe(-1);
  });

  it('takes focus on open, like any other dialog', async () => {
    const host = await renderPopover();
    expect(document.activeElement).toBe(host.byText('button', 'Health'));
  });
});
