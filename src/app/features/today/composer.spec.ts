import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { addDays, today } from '../../core/dates';
import { TaskStore } from '../../core/task.store';
import { render, type Rendered } from '../../../testing/render';
import { Composer } from './composer';

/**
 * The composer is a modal at every width: a scrim, Escape, an explicit Cancel
 * and a Tab that cannot leave. The trap is the part worth a real test, since
 * nothing about it is visible until a keyboard user is stuck behind it.
 */

async function renderComposer(day: string | null = null): Promise<Rendered<Composer>> {
  const rendered = await render(Composer, {
    inputs: { day },
    providers: [{ provide: TaskStore, useValue: { categories: signal([]) } }],
  });
  makeMeasurable(rendered.el);
  await rendered.settle();
  return rendered;
}

/**
 * The trap filters its stops by `getClientRects().length`, and jsdom lays
 * nothing out, so every element reports itself invisible and the trap would
 * bail before doing anything. This gives the elements a box to be measured by;
 * it stubs the layout engine, not the component.
 */
function makeMeasurable(root: HTMLElement): void {
  for (const el of [root, ...root.querySelectorAll('*')]) {
    Object.defineProperty(el, 'getClientRects', {
      configurable: true,
      value: () => [new DOMRect(0, 0, 10, 10)],
    });
  }
}

function panelOf(composer: Rendered<Composer>): HTMLElement {
  const panel = composer.queryAll('div').find((d) => d.querySelector('app-capture'));
  if (!panel) throw new Error('no panel');
  return panel;
}

/** The stops the trap will see, in the order it sees them. */
function stops(composer: Rendered<Composer>): HTMLElement[] {
  return [
    ...panelOf(composer).querySelectorAll<HTMLElement>('a[href],button,input,textarea,select'),
  ].filter((el) => !el.hasAttribute('disabled'));
}

async function tab(composer: Rendered<Composer>, shiftKey = false): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement ?? document.body).dispatchEvent(event);
  await composer.settle();
  return event;
}

function buttonNamed(composer: Rendered<Composer>, label: string): HTMLElement {
  const found = composer.queryAll('button').find((b) => (b.textContent ?? '').trim() === label);
  if (!found) throw new Error(`no button named ${label}`);
  return found;
}

describe('Composer', () => {
  it('puts a labelled scrim behind the panel', async () => {
    const composer = await renderComposer();
    const scrim = composer
      .queryAll('button')
      .find((b) => b.getAttribute('aria-label') === 'Close the composer');
    expect(scrim).toBeDefined();
  });

  it('dismisses when the scrim is pressed', async () => {
    const composer = await renderComposer();
    const cancelled = vi.fn();
    composer.component.cancelled.subscribe(cancelled);

    const scrim = composer
      .queryAll('button')
      .find((b) => b.getAttribute('aria-label') === 'Close the composer');
    await composer.click(scrim as HTMLElement);

    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Escape', async () => {
    const composer = await renderComposer();
    const cancelled = vi.fn();
    composer.component.cancelled.subscribe(cancelled);

    const area = composer.query('textarea') as HTMLTextAreaElement;
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await composer.settle();

    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('dismisses through the explicit Cancel, so the modal is never a trap without a door', async () => {
    const composer = await renderComposer();
    const cancelled = vi.fn();
    composer.component.cancelled.subscribe(cancelled);

    await composer.click(buttonNamed(composer, 'Cancel'));

    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('forwards what the capture box committed', async () => {
    const composer = await renderComposer();
    const submitted = vi.fn();
    composer.component.submitted.subscribe(submitted);

    const area = composer.query('textarea') as HTMLTextAreaElement;
    area.value = 'call physio';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await composer.settle();
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await composer.settle();

    expect(submitted).toHaveBeenCalledWith({ text: 'call physio', scheduling: null });
  });

  it('takes the caret on open, since it was opened by a deliberate act', async () => {
    const composer = await renderComposer();
    expect(document.activeElement?.tagName).toBe('TEXTAREA');
  });

  it('presets the day when it was opened from a dated row', async () => {
    const day = addDays(today(), 3);
    const composer = await renderComposer(day);
    const chip = composer
      .queryAll('button')
      .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Scheduled for'));

    expect(chip?.getAttribute('aria-label')).not.toContain('Scheduled for Today');
  });

  it('lets the text decide the day when it was opened from nowhere in particular', async () => {
    const composer = await renderComposer();
    const chip = composer
      .queryAll('button')
      .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Scheduled for'));

    expect(chip?.getAttribute('aria-label')).toBe('Scheduled for Today. Change the date');
  });

  describe('the focus trap', () => {
    it('wraps Tab from the last stop back to the first', async () => {
      const composer = await renderComposer();
      const all = stops(composer);
      all[all.length - 1].focus();

      const event = await tab(composer);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(all[0]);
    });

    it('wraps Shift+Tab from the first stop round to the last', async () => {
      const composer = await renderComposer();
      const all = stops(composer);
      all[0].focus();

      const event = await tab(composer, true);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(all[all.length - 1]);
    });

    it('leaves a Tab in the middle of the panel to the browser', async () => {
      const composer = await renderComposer();
      const all = stops(composer);
      all[0].focus();

      const event = await tab(composer);

      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(all[0]);
    });

    it('brings focus home when the browser has already walked off the panel', async () => {
      const composer = await renderComposer();
      const all = stops(composer);
      document.body.focus();

      await tab(composer);

      expect(document.activeElement).toBe(all[0]);
    });

    it('does not count the disabled commit button as a stop', async () => {
      const composer = await renderComposer();
      const commit = buttonNamed(composer, 'Add') as HTMLButtonElement;
      expect(commit.disabled).toBe(true);
      expect(stops(composer)).not.toContain(commit);
    });
  });
});
