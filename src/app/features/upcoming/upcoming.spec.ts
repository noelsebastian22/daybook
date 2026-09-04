import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addDays, friendlyDate, today, weekdayAndDate } from '../../core/dates';
import type { Category, Task } from '../../core/models';
import { TaskStore } from '../../core/task.store';
import { makeDoneTask, makeTask, resetIds } from '../../../testing/fakes';
import { render, type Rendered } from '../../../testing/render';
import { MAX_WEEK } from './upcoming.constants';
import { Upcoming } from './upcoming';

/**
 * Upcoming exists for the per-day add row: scheduling by position is a
 * different act from typing a weekday, and week 0 starting tomorrow is what
 * keeps it from repeating the Today page.
 */

const TOMORROW = addDays(today(), 1);

let tasks: WritableSignal<Task[]>;
let toggleComplete: ReturnType<typeof vi.fn>;
let reschedule: ReturnType<typeof vi.fn>;
let addFromCapture: ReturnType<typeof vi.fn>;

async function renderUpcoming(): Promise<Rendered<Upcoming>> {
  return render(Upcoming);
}

function dayHeadings(page: Rendered<Upcoming>): string[] {
  return page.queryAll('h2').map((h) => (h.textContent ?? '').trim());
}

function addRowFor(page: Rendered<Upcoming>, date: string): HTMLElement {
  const label = `Add a task on ${weekdayAndDate(date)}`;
  const button = page.queryAll('button').find((b) => b.getAttribute('aria-label') === label);
  if (!button) throw new Error(`no add row for ${date}`);
  return button;
}

function paged(page: Rendered<Upcoming>, label: string): HTMLButtonElement {
  return page
    .queryAll('button')
    .find((b) => b.getAttribute('aria-label') === label) as HTMLButtonElement;
}

describe('Upcoming', () => {
  beforeEach(() => {
    resetIds();
    tasks = signal<Task[]>([]);
    toggleComplete = vi.fn();
    reschedule = vi.fn();
    addFromCapture = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: TaskStore,
          useValue: {
            tasks,
            categories: signal<Category[]>([]),
            categoryById: signal(new Map<string, Category>()),
            ensureLoaded: vi.fn(),
            addFromCapture,
            toggleComplete,
            reschedule,
          },
        },
      ],
    });
  });

  it('shows a week at a time', async () => {
    const page = await renderUpcoming();
    expect(dayHeadings(page)).toHaveLength(7);
  });

  it('starts tomorrow, because Today has its own page', async () => {
    const page = await renderUpcoming();
    expect(dayHeadings(page)[0]).toBe(friendlyDate(TOMORROW));
    expect(dayHeadings(page)).not.toContain('Today');
  });

  it('leaves today off the page entirely', async () => {
    tasks.set([makeTask({ text: 'today thing', scheduled_date: today() })]);
    const page = await renderUpcoming();

    expect(page.el.textContent).not.toContain('today thing');
  });

  it('files a task under the day it is scheduled for', async () => {
    tasks.set([makeTask({ text: 'call physio', scheduled_date: TOMORROW })]);
    const page = await renderUpcoming();

    const section = page.queryAll('section')[0];
    expect(section.textContent).toContain('call physio');
  });

  it('drops a task already finished, since this page is what is still coming', async () => {
    tasks.set([
      makeDoneTask({ text: 'finished early', scheduled_date: TOMORROW }),
      makeTask({ text: 'still open', scheduled_date: TOMORROW }),
    ]);
    const page = await renderUpcoming();

    expect(page.el.textContent).toContain('still open');
    expect(page.el.textContent).not.toContain('finished early');
  });

  it('counts what is on a day that has anything', async () => {
    tasks.set([
      makeTask({ text: 'one', scheduled_date: TOMORROW }),
      makeTask({ text: 'two', scheduled_date: TOMORROW }),
    ]);
    const page = await renderUpcoming();

    expect(page.queryAll('section')[0].querySelector('h2 + span')?.textContent?.trim()).toBe('2');
  });

  it('counts nothing on an empty day rather than printing a zero', async () => {
    const page = await renderUpcoming();
    expect(page.queryAll('section')[0].querySelector('h2 + span')).toBeNull();
  });

  it('offers an add row on every day, named for the day it schedules', async () => {
    const page = await renderUpcoming();
    for (let i = 0; i < 7; i++) {
      expect(addRowFor(page, addDays(TOMORROW, i))).toBeDefined();
    }
  });

  it('opens the composer already set to the day the add row belongs to', async () => {
    const page = await renderUpcoming();
    const day = addDays(TOMORROW, 2);
    await page.click(addRowFor(page, day));

    const chip = page
      .queryAll('button')
      .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Scheduled for'));
    expect(chip?.getAttribute('aria-label')).toBe(
      `Scheduled for ${friendlyDate(day)}. Change the date`,
    );
  });

  it('closes the composer again when it is cancelled', async () => {
    const page = await renderUpcoming();
    await page.click(addRowFor(page, TOMORROW));
    expect(page.query('app-composer')).not.toBeNull();

    const scrim = page
      .queryAll('button')
      .find((b) => b.getAttribute('aria-label') === 'Close the composer');
    await page.click(scrim as HTMLElement);

    expect(page.query('app-composer')).toBeNull();
  });

  it('hands a committed task to the store and closes the composer', async () => {
    const page = await renderUpcoming();
    await page.click(addRowFor(page, TOMORROW));

    const area = page.query('textarea') as HTMLTextAreaElement;
    area.value = 'call physio';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await page.settle();
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await page.settle();

    expect(addFromCapture).toHaveBeenCalledWith('call physio', {
      scheduled_date: TOMORROW,
      reminder_at: null,
    });
    expect(page.query('app-composer')).toBeNull();
  });

  describe('paging', () => {
    it('names the first page for what it is rather than by its dates', async () => {
      const page = await renderUpcoming();
      expect(page.query('h1')?.textContent?.trim()).toBe('Next 7 days');
    });

    it('spells out the dates once the user has paged on', async () => {
      const page = await renderUpcoming();
      await page.click(paged(page, 'Next week'));

      const start = addDays(TOMORROW, 7);
      expect(page.query('h1')?.textContent?.trim()).toBe(
        `${weekdayAndDate(start)} – ${weekdayAndDate(addDays(start, 6))}`,
      );
    });

    it('will not page back off the front of the list', async () => {
      const page = await renderUpcoming();
      expect(paged(page, 'Previous week').disabled).toBe(true);
    });

    it('stops at the horizon the store actually loads', async () => {
      const page = await renderUpcoming();
      for (let i = 0; i < MAX_WEEK; i++) {
        expect(paged(page, 'Next week').disabled).toBe(false);
        await page.click(paged(page, 'Next week'));
      }

      expect(paged(page, 'Next week').disabled).toBe(true);
    });
  });

  it('completes through the store', async () => {
    const task = makeTask({ scheduled_date: TOMORROW });
    tasks.set([task]);
    const page = await renderUpcoming();

    await page.click(
      page
        .queryAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Mark as done') as HTMLElement,
    );

    expect(toggleComplete).toHaveBeenCalledWith(task);
  });

  it('pushes a task on by one day from its own date, not from today', async () => {
    const day = addDays(TOMORROW, 3);
    const task = makeTask({ scheduled_date: day });
    tasks.set([task]);
    const page = await renderUpcoming();

    await page.click(
      page
        .queryAll('button')
        .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Move to')) as HTMLElement,
    );

    expect(reschedule).toHaveBeenCalledWith(task, addDays(day, 1));
  });
});
