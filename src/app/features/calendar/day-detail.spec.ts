import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addDays, friendlyDate, today as todayDate } from '../../core/dates';
import type { Category, DaySnapshot, Task } from '../../core/models';
import { TaskStore } from '../../core/task.store';
import { makeDoneTask, makeSnapshot, makeTask, resetIds, USER_ID } from '../../../testing/fakes';
import { render, type Rendered } from '../../../testing/render';
import { DayDetail } from './day-detail';

/**
 * A past day is not "the tasks whose scheduled_date is that day".
 *
 * Rollover *moves* anything unfinished forward, so the only tasks still
 * carrying a past date are the ones completed on it. Everything else walked
 * away, and the only record of what walked is
 * `day_snapshots.carried_task_ids`. The two lists on this page therefore come
 * from two different places, and a spec that fed both from `tasks()` would
 * pass while the page showed half the day.
 *
 * Days are derived from the real `today()`: `past()` compares against it, so a
 * frozen fixture date would put every test on the same side of the branch.
 */

const TODAY = todayDate();
const PAST = addDays(TODAY, -3);
const FUTURE = addDays(TODAY, 3);

let tasks: WritableSignal<Task[]>;
let byId: WritableSignal<Map<string, Task>>;
let categoriesById: WritableSignal<Map<string, Category>>;
let categories: WritableSignal<Category[]>;
let snapshots: WritableSignal<Map<string, DaySnapshot>>;

let loadSnapshots: ReturnType<typeof vi.fn>;
let loadRange: ReturnType<typeof vi.fn>;
let ensureLoaded: ReturnType<typeof vi.fn>;
let toggleComplete: ReturnType<typeof vi.fn>;
let reschedule: ReturnType<typeof vi.fn>;
let addFromCapture: ReturnType<typeof vi.fn>;

function hold(...rows: Task[]): void {
  tasks.set(rows);
  byId.set(new Map(rows.map((t) => [t.id, t])));
}

function snapshot(over: Partial<DaySnapshot>): void {
  const row = makeSnapshot({ user_id: USER_ID, ...over });
  snapshots.set(new Map([[row.date, row]]));
}

async function renderDay(date: string): Promise<Rendered<DayDetail>> {
  return render(DayDetail, { inputs: { date } });
}

function section(page: Rendered<DayDetail>, heading: string): HTMLElement | null {
  return (
    page
      .queryAll('section')
      .find((s) => (s.querySelector('h2')?.textContent ?? '').includes(heading)) ?? null
  );
}

describe('DayDetail', () => {
  beforeEach(() => {
    resetIds();
    tasks = signal<Task[]>([]);
    byId = signal(new Map<string, Task>());
    categoriesById = signal(new Map<string, Category>());
    categories = signal<Category[]>([]);
    snapshots = signal(new Map<string, DaySnapshot>());

    loadSnapshots = vi.fn();
    loadRange = vi.fn();
    ensureLoaded = vi.fn();
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
            taskById: byId,
            categoryById: categoriesById,
            categories,
            snapshotByDate: snapshots,
            loadSnapshots,
            loadRange,
            ensureLoaded,
            toggleComplete,
            reschedule,
            addFromCapture,
          },
        },
      ],
    });
  });

  describe('what it fetches', () => {
    it('asks for the one snapshot the day is about', async () => {
      await renderDay(PAST);
      expect(loadSnapshots).toHaveBeenCalledWith(PAST, PAST);
    });

    it('asks for a window forward of the day, so a carried task can name where it landed', async () => {
      await renderDay(PAST);
      expect(loadRange).toHaveBeenCalledWith(PAST, addDays(PAST, 30));
    });

    it('loads the store itself, because a deep link can land here first', async () => {
      await renderDay(PAST);
      expect(ensureLoaded).toHaveBeenCalled();
    });

    it('refetches when the route moves to another day', async () => {
      const page = await renderDay(PAST);
      loadSnapshots.mockClear();

      await page.setInput('date', TODAY);

      expect(loadSnapshots).toHaveBeenCalledWith(TODAY, TODAY);
    });
  });

  describe('a past day', () => {
    it('shows what was finished and what was carried off, from two different places', async () => {
      const finished = makeDoneTask({ id: 'done-1', text: 'call physio', scheduled_date: PAST });
      // Rollover moved this one forward, so nothing about it points at PAST any
      // more except the snapshot.
      const walked = makeTask({ id: 'gone-1', text: 'book dentist', scheduled_date: TODAY });
      hold(finished, walked);
      snapshot({ date: PAST, completed_count: 1, carried_count: 1, carried_task_ids: ['gone-1'] });

      const page = await renderDay(PAST);

      expect(section(page, 'Finished')?.textContent).toContain('call physio');
      expect(section(page, 'Carried off this day')?.textContent).toContain('book dentist');
    });

    it('says where a carried task ended up', async () => {
      hold(makeTask({ id: 'gone-1', text: 'book dentist', scheduled_date: TODAY }));
      snapshot({ date: PAST, carried_task_ids: ['gone-1'] });

      const page = await renderDay(PAST);

      expect(section(page, 'Carried off this day')?.textContent).toContain(
        `now on ${friendlyDate(TODAY)}`,
      );
    });

    it('links a carried task to its own page', async () => {
      hold(makeTask({ id: 'gone-1', text: 'book dentist', scheduled_date: TODAY }));
      snapshot({ date: PAST, carried_task_ids: ['gone-1'] });

      const page = await renderDay(PAST);
      const link = page.byText('a', 'book dentist');

      expect(link?.getAttribute('href')).toBe('/today/gone-1');
    });

    it('counts a carried task that has since been deleted instead of quietly losing it', async () => {
      snapshot({ date: PAST, carried_count: 1, carried_task_ids: ['deleted-1'] });

      const page = await renderDay(PAST);

      expect(page.el.textContent).toContain('1 more carried off this day');
      expect(page.el.textContent).toContain('has since been deleted');
    });

    it('says "have" when more than one is missing', async () => {
      snapshot({ date: PAST, carried_count: 2, carried_task_ids: ['deleted-1', 'deleted-2'] });

      const page = await renderDay(PAST);

      expect(page.el.textContent).toContain('2 more carried off this day');
      expect(page.el.textContent).toContain('have since been deleted');
    });

    it('reports the day’s two counts from the snapshot', async () => {
      snapshot({ date: PAST, completed_count: 3, carried_count: 2 });

      const page = await renderDay(PAST);

      expect(page.el.textContent).toContain('3 done, 2 carried off');
    });

    it('distinguishes a day nothing was done from a day the app was never opened', async () => {
      const page = await renderDay(PAST);

      expect(page.el.textContent).toContain('The app was not opened this day.');
      expect(page.el.textContent).not.toContain('0 done');
    });

    it('does not offer to add a task to a day that has already been', async () => {
      const page = await renderDay(PAST);

      expect(page.byText('button', 'Add task')).toBeNull();
    });

    it('heads the list Finished, because on a past day that is what being on it means', async () => {
      hold(makeDoneTask({ id: 'done-1', scheduled_date: PAST }));

      const page = await renderDay(PAST);

      expect(section(page, 'Finished')).not.toBeNull();
    });

    it('says nothing was recorded when the day is empty', async () => {
      const page = await renderDay(PAST);

      expect(page.el.textContent).toContain('Nothing recorded for this day.');
    });
  });

  describe('a day still to come', () => {
    it('lists what is scheduled without calling it finished', async () => {
      hold(makeTask({ id: 't1', text: 'call physio', scheduled_date: FUTURE }));

      const page = await renderDay(FUTURE);

      expect(page.el.textContent).toContain('call physio');
      expect(section(page, 'Finished')).toBeNull();
    });

    it('says nothing is scheduled rather than nothing was recorded', async () => {
      const page = await renderDay(FUTURE);

      expect(page.el.textContent).toContain('Nothing scheduled yet.');
    });

    it('reports no counts, because there is nothing to report yet', async () => {
      const page = await renderDay(FUTURE);

      expect(page.el.textContent).not.toContain('carried off');
      expect(page.el.textContent).not.toContain('The app was not opened this day.');
    });

    it('offers to add a task to it', async () => {
      const page = await renderDay(FUTURE);

      expect(page.byText('button', 'Add task')).not.toBeNull();
    });

    it('schedules what is written into the composer onto that day', async () => {
      const page = await renderDay(FUTURE);
      await page.click(page.byText('button', 'Add task') as HTMLElement);

      const box = page.query('textarea') as HTMLTextAreaElement;
      box.value = 'call physio';
      box.dispatchEvent(new Event('input'));
      await page.settle();
      const commit = page
        .queryAll('button')
        .find((b) => (b.textContent ?? '').trim() === 'Add') as HTMLElement;
      await page.click(commit);

      expect(addFromCapture).toHaveBeenCalledWith('call physio', {
        scheduled_date: FUTURE,
        reminder_at: null,
      });
      expect(page.query('textarea')).toBeNull();
    });
  });

  describe('acting on a row', () => {
    it('completes through the store', async () => {
      const task = makeTask({ id: 't1', scheduled_date: TODAY });
      hold(task);

      const page = await renderDay(TODAY);
      const box = page
        .queryAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Mark as done') as HTMLElement;
      await page.click(box);

      expect(toggleComplete).toHaveBeenCalledWith(task);
    });

    it('pushes a row on by a day from its own date', async () => {
      const task = makeTask({ id: 't1', scheduled_date: FUTURE });
      hold(task);

      const page = await renderDay(FUTURE);
      const push = page
        .queryAll('button')
        .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Move to')) as HTMLElement;
      await page.click(push);

      expect(reschedule).toHaveBeenCalledWith(task, addDays(FUTURE, 1));
    });
  });

  it('orders the day by when each task was written', async () => {
    hold(
      makeTask({
        id: 'b',
        text: 'second',
        scheduled_date: TODAY,
        created_at: `${TODAY}T11:00:00Z`,
      }),
      makeTask({ id: 'a', text: 'first', scheduled_date: TODAY, created_at: `${TODAY}T09:00:00Z` }),
    );

    const page = await renderDay(TODAY);
    const rows = page.queryAll('app-task-row').map((r) => r.textContent ?? '');

    expect(rows[0]).toContain('first');
    expect(rows[1]).toContain('second');
  });
});
