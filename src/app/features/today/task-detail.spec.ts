import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addDays, friendlyDate, today as todayDate, weekdayAndDate } from '../../core/dates';
import type { Category, Task } from '../../core/models';
import { TaskStore } from '../../core/task.store';
import { makeCategory, makeDoneTask, makeTask, resetIds } from '../../../testing/fakes';
import { render, type Rendered } from '../../../testing/render';
import { TaskDetail } from './task-detail';

/**
 * The task as an object, at its own route.
 *
 * The card is the only place a typo can be fixed and the only place a task can
 * be deleted, and both go back through the store holding the *same row* — an
 * edit is a patch, and an Undo puts the task back under its original id rather
 * than making a copy of it. The spec pins what the card hands over, because
 * that identity is the whole difference between an undo and a duplicate.
 *
 * Dates are derived from the real `today()` rather than a frozen fixture. The
 * push button's label is decided by comparing against today, so a fixed
 * "today" in the past would make the branch it is testing unreachable.
 */

const TODAY = todayDate();
const NEXT_WEEK = addDays(TODAY, 7);

let byId: WritableSignal<Map<string, Task>>;
let categoriesById: WritableSignal<Map<string, Category>>;
let categories: WritableSignal<Category[]>;
let loaded: WritableSignal<boolean>;

let ensureLoaded: ReturnType<typeof vi.fn>;
let toggleComplete: ReturnType<typeof vi.fn>;
let reschedule: ReturnType<typeof vi.fn>;
let editFromCapture: ReturnType<typeof vi.fn>;
let removeWithUndo: ReturnType<typeof vi.fn>;

function hold(...tasks: Task[]): void {
  byId.set(new Map(tasks.map((t) => [t.id, t])));
  loaded.set(true);
}

function holdCategory(category: Category): void {
  categories.set([category]);
  categoriesById.set(new Map([[category.id, category]]));
}

async function renderDetail(id: string): Promise<Rendered<TaskDetail>> {
  return render(TaskDetail, { inputs: { id } });
}

function button(page: Rendered<TaskDetail>, label: string): HTMLElement {
  const found = page.queryAll('button').find((b) => (b.textContent ?? '').trim() === label);
  if (!found) throw new Error(`no button named ${label}`);
  return found;
}

function checkbox(page: Rendered<TaskDetail>): HTMLElement {
  const found = page
    .queryAll('button')
    .find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Mark as'));
  if (!found) throw new Error('no completion checkbox');
  return found;
}

async function pressEscape(page: Rendered<TaskDetail>): Promise<void> {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await page.settle();
}

describe('TaskDetail', () => {
  let router: Router;

  beforeEach(() => {
    resetIds();
    byId = signal(new Map<string, Task>());
    categoriesById = signal(new Map<string, Category>());
    categories = signal<Category[]>([]);
    loaded = signal(false);

    ensureLoaded = vi.fn();
    toggleComplete = vi.fn();
    reschedule = vi.fn();
    editFromCapture = vi.fn();
    removeWithUndo = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: TaskStore,
          useValue: {
            taskById: byId,
            categoryById: categoriesById,
            categories,
            loaded,
            ensureLoaded,
            toggleComplete,
            reschedule,
            editFromCapture,
            removeWithUndo,
          },
        },
      ],
    });

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  describe('what the card says', () => {
    it('loads the store itself, because a deep link can land here first', async () => {
      await renderDetail('task-1');
      expect(ensureLoaded).toHaveBeenCalled();
    });

    it('shows the task and the day it is on', async () => {
      hold(makeTask({ id: 't1', text: 'call physio', scheduled_date: TODAY }));

      const page = await renderDetail('t1');

      expect(page.el.textContent).toContain('call physio');
      expect(page.el.textContent).toContain('Today');
    });

    it('names the category rather than only colouring it', async () => {
      const category = makeCategory({ id: 'c1', name: 'Health', slug: 'health' });
      holdCategory(category);
      hold(makeTask({ id: 't1', category_id: 'c1' }));

      const page = await renderDetail('t1');

      expect(page.el.textContent).toContain('Health');
    });

    it('shows the energy the task was written with', async () => {
      hold(makeTask({ id: 't1', energy: 'deep' }));

      const page = await renderDetail('t1');

      expect(page.el.textContent).toContain('deep');
    });

    it('shows the two counts the history is there to answer', async () => {
      hold(makeTask({ id: 't1', carried_over_count: 4, reschedule_count: 2 }));

      const page = await renderDetail('t1');
      const values = page.queryAll('dd').map((d) => (d.textContent ?? '').trim());

      expect(values).toContain('4×');
      expect(values).toContain('2×');
    });

    it('says when a done task was finished', async () => {
      hold(makeDoneTask({ id: 't1' }));

      const page = await renderDetail('t1');

      expect(page.el.textContent).toContain('done');
    });

    it('says the task is gone once the store has actually looked', async () => {
      loaded.set(true);

      const page = await renderDetail('missing');

      expect(page.el.textContent).toContain('That task is gone.');
    });

    it('waits rather than claiming the task is gone while the store is still loading', async () => {
      const page = await renderDetail('missing');

      expect(page.el.textContent).not.toContain('That task is gone.');
    });
  });

  describe('completing', () => {
    it('offers a checkbox that names what pressing it would do', async () => {
      hold(makeTask({ id: 't1' }));

      const page = await renderDetail('t1');

      expect(checkbox(page).getAttribute('aria-label')).toBe('Mark as done');
      expect(checkbox(page).getAttribute('aria-pressed')).toBe('false');
    });

    it('names the other direction on a task already done', async () => {
      hold(makeDoneTask({ id: 't1' }));

      const page = await renderDetail('t1');

      expect(checkbox(page).getAttribute('aria-label')).toBe('Mark as not done');
      expect(checkbox(page).getAttribute('aria-pressed')).toBe('true');
    });

    it('hands the task to the store', async () => {
      const task = makeTask({ id: 't1' });
      hold(task);

      const page = await renderDetail('t1');
      await page.click(checkbox(page));

      expect(toggleComplete).toHaveBeenCalledWith(task);
    });
  });

  describe('pushing a day', () => {
    it('says Tomorrow when tomorrow is what it means', async () => {
      hold(makeTask({ id: 't1', scheduled_date: TODAY }));

      const page = await renderDetail('t1');

      expect(button(page, '→ Tomorrow')).not.toBeNull();
    });

    it('names the day when the task is far enough out that Tomorrow would be a lie', async () => {
      hold(makeTask({ id: 't1', scheduled_date: NEXT_WEEK }));
      const landing = addDays(NEXT_WEEK, 1);

      const page = await renderDetail('t1');

      // The button moves the task on from its own date, not from today.
      expect(friendlyDate(landing)).not.toBe('Tomorrow');
      expect(button(page, `→ ${weekdayAndDate(landing)}`)).not.toBeNull();
    });

    it('moves the task on by one day from its own date', async () => {
      const task = makeTask({ id: 't1', scheduled_date: NEXT_WEEK });
      hold(task);

      const page = await renderDetail('t1');
      await page.click(button(page, `→ ${weekdayAndDate(addDays(NEXT_WEEK, 1))}`));

      expect(reschedule).toHaveBeenCalledWith(task, addDays(NEXT_WEEK, 1));
    });

    it('does not offer to push a task that is already done', async () => {
      hold(makeDoneTask({ id: 't1', scheduled_date: TODAY }));

      const page = await renderDetail('t1');

      expect(page.byText('button', 'Tomorrow')).toBeNull();
    });
  });

  describe('editing', () => {
    it('opens the box with the task spelled back out as tokens', async () => {
      holdCategory(makeCategory({ id: 'c1', name: 'Health', slug: 'health' }));
      hold(makeTask({ id: 't1', text: 'call physio', category_id: 'c1', energy: 'quick' }));

      const page = await renderDetail('t1');
      await page.click(button(page, 'Edit'));

      const box = page.query('textarea') as HTMLTextAreaElement;
      expect(box.value).toBe('call physio #health !quick');
    });

    it('hands the store the task it is editing, not a new one', async () => {
      const task = makeTask({ id: 't1', text: 'call physio', scheduled_date: TODAY });
      hold(task);

      const page = await renderDetail('t1');
      await page.click(button(page, 'Edit'));
      await page.click(button(page, 'Save'));

      expect(editFromCapture).toHaveBeenCalledWith(task, 'call physio', {
        scheduled_date: TODAY,
        reminder_at: null,
      });
    });

    it('carries the task’s own day into the edit, so typing does not re-date it to today', async () => {
      hold(makeTask({ id: 't1', scheduled_date: NEXT_WEEK }));

      const page = await renderDetail('t1');
      await page.click(button(page, 'Edit'));
      await page.click(button(page, 'Save'));

      expect(editFromCapture.mock.calls[0][2]).toEqual({
        scheduled_date: NEXT_WEEK,
        reminder_at: null,
      });
    });

    it('closes the box again once it has saved', async () => {
      hold(makeTask({ id: 't1' }));

      const page = await renderDetail('t1');
      await page.click(button(page, 'Edit'));
      await page.click(button(page, 'Save'));

      expect(page.query('textarea')).toBeNull();
      expect(button(page, 'Edit')).not.toBeNull();
    });

    it('changes nothing when the edit is cancelled', async () => {
      hold(makeTask({ id: 't1' }));

      const page = await renderDetail('t1');
      await page.click(button(page, 'Edit'));
      await page.click(button(page, 'Cancel'));

      expect(editFromCapture).not.toHaveBeenCalled();
      expect(page.query('textarea')).toBeNull();
    });
  });

  describe('deleting', () => {
    it('leaves for the list rather than sitting on a card with no task', async () => {
      hold(makeTask({ id: 't1' }));

      const page = await renderDetail('t1');
      await page.click(button(page, 'Delete'));

      expect(router.navigate).toHaveBeenCalledWith(['/today']);
    });

    it('hands the whole row over, which is what an Undo needs to put it back', async () => {
      const task = makeTask({ id: 't1', text: 'call physio' });
      hold(task);

      const page = await renderDetail('t1');
      await page.click(button(page, 'Delete'));

      // Same object, id and all: the store re-inserts it under its own id, so
      // an Undo restores the row instead of making a second one.
      expect(removeWithUndo).toHaveBeenCalledWith(task);
      expect(removeWithUndo.mock.calls[0][0].id).toBe('t1');
    });

    it('asks nothing first — there are no confirmation dialogs in this app', async () => {
      hold(makeTask({ id: 't1' }));

      const page = await renderDetail('t1');
      await page.click(button(page, 'Delete'));

      expect(page.query('[role="alertdialog"]')).toBeNull();
      expect(removeWithUndo).toHaveBeenCalled();
    });
  });

  describe('escape', () => {
    it('goes back to the list', async () => {
      hold(makeTask({ id: 't1' }));

      const page = await renderDetail('t1');
      await pressEscape(page);

      expect(router.navigate).toHaveBeenCalledWith(['/today']);
    });

    it('is left to the edit box while one is open, which closes it instead', async () => {
      hold(makeTask({ id: 't1' }));

      const page = await renderDetail('t1');
      await page.click(button(page, 'Edit'));
      await pressEscape(page);

      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
