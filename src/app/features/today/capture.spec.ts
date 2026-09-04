import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addDays, today } from '../../core/dates';
import type { Category } from '../../core/models';
import { TaskStore } from '../../core/task.store';
import { makeCategory, resetIds } from '../../../testing/fakes';
import { render, type Rendered } from '../../../testing/render';
import { Capture, type CaptureSubmit } from './capture';

/**
 * Capture is a textarea over a mirror div, so nearly everything here is about
 * the two staying in step: the chips are a pure render of the parse, and the
 * parse is a pure function of what is in the box.
 */

function withCategories(categories: Category[] = []) {
  return [{ provide: TaskStore, useValue: { categories: signal(categories) } }];
}

async function renderCapture(
  inputs: Record<string, unknown> = {},
  categories: Category[] = [],
): Promise<Rendered<Capture>> {
  return render(Capture, { inputs, providers: withCategories(categories) });
}

async function type(box: Rendered<Capture>, text: string): Promise<void> {
  const area = box.query('textarea') as HTMLTextAreaElement;
  area.value = text;
  area.dispatchEvent(new Event('input', { bubbles: true }));
  await box.settle();
}

async function press(box: Rendered<Capture>, key: string, shiftKey = false): Promise<void> {
  const area = box.query('textarea') as HTMLTextAreaElement;
  area.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  await box.settle();
}

/** The chip that opens the date picker, found by what it does. */
function dateChip(box: Rendered<Capture>): HTMLElement {
  const chip = box
    .queryAll('button')
    .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Scheduled for'));
  if (!chip) throw new Error('no date chip');
  return chip;
}

function chipByLabel(box: Rendered<Capture>, starts: string): HTMLElement | undefined {
  return box
    .queryAll('button')
    .find((b) => (b.getAttribute('aria-label') ?? '').startsWith(starts));
}

/**
 * An option inside whichever layer is open. Scoped, because the chip that
 * opened the layer usually carries the same word — the `#health` chip and the
 * `Health` option are both buttons reading "health".
 */
function optionIn(box: Rendered<Capture>, layer: string, label: string): HTMLElement {
  const wanted = label.toLowerCase();
  const option = box
    .queryAll(`${layer} button`)
    .find((b) => (b.textContent ?? '').trim().toLowerCase().startsWith(wanted));
  if (!option) throw new Error(`no ${label} option in ${layer}`);
  return option;
}

/** A button by its whole label, so "Add" cannot match "Add time". */
function buttonNamed(box: Rendered<Capture>, label: string): HTMLButtonElement {
  const found = box.queryAll('button').find((b) => (b.textContent ?? '').trim() === label) as
    HTMLButtonElement | undefined;
  if (!found) throw new Error(`no button named ${label}`);
  return found;
}

describe('Capture', () => {
  beforeEach(() => resetIds());

  it('names the box for a screen reader', async () => {
    const box = await renderCapture();
    expect(box.query('textarea')?.getAttribute('aria-label')).toBe('Add a task');
  });

  it('hides the highlight mirror from assistive tech, since the textarea holds the text', async () => {
    const box = await renderCapture();
    const mirror = box.query('[aria-hidden="true"]');
    expect(mirror).not.toBeNull();
    expect(mirror?.textContent).toContain('Add a task. Try');
  });

  it('keeps the mirror and the textarea on the same line box, or the highlight drifts', async () => {
    const box = await renderCapture();
    const mirror = box.query('[aria-hidden="true"]') as HTMLElement;
    const area = box.query('textarea') as HTMLTextAreaElement;

    // Compared with each other, never against a literal: what matters is that
    // the two agree, not what the step is called this week.
    const lineBox = (el: HTMLElement) => [...el.classList].filter((c) => c.startsWith('leading-'));

    expect(lineBox(mirror)).not.toEqual([]);
    expect(lineBox(area)).toEqual(lineBox(mirror));
  });

  it('drops the placeholder as soon as anything is typed', async () => {
    const box = await renderCapture();
    await type(box, 'call physio');

    const mirror = box.query('[aria-hidden="true"]');
    expect(mirror?.textContent).not.toContain('Add a task. Try');
    expect(mirror?.textContent).toContain('call physio');
  });

  it('highlights a #tag as its own token in the mirror', async () => {
    const box = await renderCapture();
    await type(box, 'call physio #health');

    expect(box.byText('span', '#health')).not.toBeNull();
  });

  it('highlights an !energy as its own token in the mirror', async () => {
    const box = await renderCapture();
    await type(box, 'call physio !deep');

    expect(box.byText('span', '!deep')).not.toBeNull();
  });

  describe('the date chip', () => {
    it('is live before a date has been typed, because a day is always being applied', async () => {
      const box = await renderCapture();
      expect(dateChip(box).textContent?.trim()).toBe('Today');
    });

    it('follows a date typed into the box', async () => {
      const box = await renderCapture();
      await type(box, 'call physio tomorrow');

      expect(dateChip(box).textContent?.trim()).toBe('Tomorrow');
    });

    it('states the day it will schedule for in its label', async () => {
      const box = await renderCapture();
      expect(dateChip(box).getAttribute('aria-label')).toBe('Scheduled for Today. Change the date');
    });

    it('reports whether its picker is open', async () => {
      const box = await renderCapture();
      expect(dateChip(box).getAttribute('aria-expanded')).toBe('false');

      await box.click(dateChip(box));
      expect(dateChip(box).getAttribute('aria-expanded')).toBe('true');
    });

    it('opens the picker on the second press only to close it again', async () => {
      const box = await renderCapture();
      await box.click(dateChip(box));
      await box.click(dateChip(box));

      expect(dateChip(box).getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('the category chip', () => {
    it('offers a category to choose when none is set', async () => {
      const box = await renderCapture({}, [makeCategory({ name: 'Health', slug: 'health' })]);
      expect(chipByLabel(box, 'Choose a category')).toBeDefined();
    });

    it('lists the categories the store knows about', async () => {
      const box = await renderCapture({}, [
        makeCategory({ name: 'Health', slug: 'health' }),
        makeCategory({ name: 'Admin', slug: 'admin' }),
      ]);
      await box.click(chipByLabel(box, 'Choose a category') as HTMLElement);

      expect(optionIn(box, 'app-popover', 'Health')).toBeDefined();
      expect(optionIn(box, 'app-popover', 'Admin')).toBeDefined();
    });

    it('says so when there are none, rather than opening an empty list', async () => {
      const box = await renderCapture();
      await box.click(chipByLabel(box, 'Choose a category') as HTMLElement);

      expect(box.el.textContent).toContain('No categories yet');
    });

    it('writes the tag into the text, so the chip and the typed token cannot disagree', async () => {
      const box = await renderCapture({}, [makeCategory({ name: 'Health', slug: 'health' })]);
      await type(box, 'call physio');
      await box.click(chipByLabel(box, 'Choose a category') as HTMLElement);
      await box.click(optionIn(box, 'app-popover', 'Health'));

      expect((box.query('textarea') as HTMLTextAreaElement).value).toBe('call physio #health');
    });

    it('marks the chosen category pressed in the list', async () => {
      const box = await renderCapture({}, [makeCategory({ name: 'Health', slug: 'health' })]);
      await type(box, 'call physio #health');
      await box.click(chipByLabel(box, 'Category health') as HTMLElement);

      expect(optionIn(box, 'app-popover', 'Health').getAttribute('aria-pressed')).toBe('true');
    });

    it('clears the tag when the category already set is picked again', async () => {
      const box = await renderCapture({}, [makeCategory({ name: 'Health', slug: 'health' })]);
      await type(box, 'call physio #health');
      await box.click(chipByLabel(box, 'Category health') as HTMLElement);
      await box.click(optionIn(box, 'app-popover', 'Health'));

      expect((box.query('textarea') as HTMLTextAreaElement).value).toBe('call physio');
    });
  });

  describe('the energy chip', () => {
    it('writes the token into the text', async () => {
      const box = await renderCapture();
      await type(box, 'call physio');
      await box.click(chipByLabel(box, 'Choose an energy') as HTMLElement);
      await box.click(optionIn(box, 'app-popover', 'Deep'));

      expect((box.query('textarea') as HTMLTextAreaElement).value).toBe('call physio !deep');
    });

    it('marks the chosen energy pressed', async () => {
      const box = await renderCapture();
      await type(box, 'call physio !quick');
      await box.click(chipByLabel(box, 'Energy quick') as HTMLElement);

      expect(optionIn(box, 'app-popover', 'Quick').getAttribute('aria-pressed')).toBe('true');
      expect(optionIn(box, 'app-popover', 'Deep').getAttribute('aria-pressed')).toBe('false');
    });

    it('offers a clear control once an energy is set', async () => {
      const box = await renderCapture();
      expect(chipByLabel(box, 'Clear the energy')).toBeUndefined();

      await type(box, 'call physio !quick');
      expect(chipByLabel(box, 'Clear the energy')).toBeDefined();
    });
  });

  describe('committing', () => {
    it('submits the trimmed text on Enter', async () => {
      const box = await renderCapture();
      const submitted = vi.fn();
      box.component.submitted.subscribe(submitted);

      await type(box, '  call physio  ');
      await press(box, 'Enter');

      expect(submitted).toHaveBeenCalledWith({ text: 'call physio', scheduling: null });
    });

    it('leaves Shift+Enter to make a newline', async () => {
      const box = await renderCapture();
      const submitted = vi.fn();
      box.component.submitted.subscribe(submitted);

      await type(box, 'call physio');
      await press(box, 'Enter', true);

      expect(submitted).not.toHaveBeenCalled();
    });

    it('submits nothing for an empty box', async () => {
      const box = await renderCapture();
      const submitted = vi.fn();
      box.component.submitted.subscribe(submitted);

      await type(box, '   ');
      await press(box, 'Enter');

      expect(submitted).not.toHaveBeenCalled();
    });

    it('empties the box after an add, so the next thought starts clean', async () => {
      const box = await renderCapture();
      await type(box, 'call physio');
      await press(box, 'Enter');

      expect((box.query('textarea') as HTMLTextAreaElement).value).toBe('');
    });

    it('leaves an edit box alone on commit, since its parent unmounts it', async () => {
      const box = await renderCapture({ seed: { text: 'call physio', scheduling: null } });
      await press(box, 'Enter');

      expect((box.query('textarea') as HTMLTextAreaElement).value).toBe('call physio');
    });

    it('sends the picked day alongside the text once the picker has been used', async () => {
      const box = await renderCapture();
      const submitted = vi.fn<(s: CaptureSubmit) => void>();
      box.component.submitted.subscribe(submitted);

      await type(box, 'call physio');
      await box.click(dateChip(box));
      await box.click(optionIn(box, 'app-date-picker', 'Tomorrow'));
      await press(box, 'Enter');

      expect(submitted).toHaveBeenCalledWith({
        text: 'call physio',
        scheduling: { scheduled_date: addDays(today(), 1), reminder_at: null },
      });
    });
  });

  describe('the explicit actions', () => {
    it('are absent by default, where Enter is the only commit', async () => {
      const box = await renderCapture();
      expect(box.queryAll('button').map((b) => (b.textContent ?? '').trim())).not.toContain(
        'Cancel',
      );
    });

    it('appear when asked for, under the label the caller chose', async () => {
      const box = await renderCapture({ actions: true, commitLabel: 'Save' });
      expect(buttonNamed(box, 'Cancel')).toBeDefined();
      expect(buttonNamed(box, 'Save')).toBeDefined();
    });

    it('disable the commit until there is something to commit', async () => {
      const box = await renderCapture({ actions: true });
      expect(buttonNamed(box, 'Add').disabled).toBe(true);

      await type(box, 'call physio');
      expect(buttonNamed(box, 'Add').disabled).toBe(false);
    });

    it('cancel through the Cancel button', async () => {
      const box = await renderCapture({ actions: true });
      const cancelled = vi.fn();
      box.component.cancelled.subscribe(cancelled);

      await box.click(buttonNamed(box, 'Cancel'));

      expect(cancelled).toHaveBeenCalledTimes(1);
    });

    it('commit through the commit button', async () => {
      const box = await renderCapture({ actions: true });
      const submitted = vi.fn();
      box.component.submitted.subscribe(submitted);

      await type(box, 'call physio');
      await box.click(buttonNamed(box, 'Add'));

      expect(submitted).toHaveBeenCalledWith({ text: 'call physio', scheduling: null });
    });
  });

  describe('Escape', () => {
    it('backs out of the box when nothing is open', async () => {
      const box = await renderCapture();
      const cancelled = vi.fn();
      box.component.cancelled.subscribe(cancelled);

      await press(box, 'Escape');

      expect(cancelled).toHaveBeenCalledTimes(1);
    });

    it('closes an open layer first, so the box does not vanish underneath it', async () => {
      const box = await renderCapture();
      const cancelled = vi.fn();
      box.component.cancelled.subscribe(cancelled);

      await box.click(dateChip(box));
      await press(box, 'Escape');

      expect(cancelled).not.toHaveBeenCalled();
      expect(dateChip(box).getAttribute('aria-expanded')).toBe('false');

      await press(box, 'Escape');
      expect(cancelled).toHaveBeenCalledTimes(1);
    });
  });

  describe('seeding an edit', () => {
    it('opens with the task text already in the box', async () => {
      const box = await renderCapture({
        seed: { text: 'call physio #health', scheduling: null },
      });
      expect((box.query('textarea') as HTMLTextAreaElement).value).toBe('call physio #health');
    });

    it('keeps the task on the day it already had rather than re-dating it to today', async () => {
      const day = addDays(today(), 4);
      const box = await renderCapture({
        seed: { text: 'call physio', scheduling: { scheduled_date: day, reminder_at: null } },
      });

      expect(dateChip(box).getAttribute('aria-label')).toContain('Scheduled for');
      const submitted = vi.fn();
      box.component.submitted.subscribe(submitted);
      await press(box, 'Enter');

      expect(submitted).toHaveBeenCalledWith({
        text: 'call physio',
        scheduling: { scheduled_date: day, reminder_at: null },
      });
    });
  });
});
