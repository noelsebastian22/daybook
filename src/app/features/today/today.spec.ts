import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addDays, today as todayDate } from '../../core/dates';
import { Nav } from '../../core/nav';
import type { Category, Task } from '../../core/models';
import { TaskStore, type EnergyFilter } from '../../core/task.store';
import { makeCategory, makeDoneTask, makeTask, resetIds } from '../../../testing/fakes';
import { render, type Rendered } from '../../../testing/render';
import { Today } from './today';

/**
 * Today's header is the app's only summary of the day, and the three headings
 * it can show are three different statements: work left, a day finished, and a
 * day not started. They are not interchangeable.
 */

let openTasks: WritableSignal<Task[]>;
let doneTasks: WritableSignal<Task[]>;
let openCount: WritableSignal<number>;
let completedCount: WritableSignal<number>;
let todaysCategories: WritableSignal<Category[]>;
let filter: WritableSignal<EnergyFilter>;
let categoryFilter: WritableSignal<string | null>;
let filtered: WritableSignal<boolean>;
let upcomingCount: WritableSignal<number>;
let upcomingOpen: WritableSignal<boolean>;
let composerOpen: WritableSignal<boolean>;

let setFilter: ReturnType<typeof vi.fn>;
let setCategoryFilter: ReturnType<typeof vi.fn>;
let clearFilters: ReturnType<typeof vi.fn>;
let toggleUpcoming: ReturnType<typeof vi.fn>;
let toggleComplete: ReturnType<typeof vi.fn>;
let reschedule: ReturnType<typeof vi.fn>;
let addFromCapture: ReturnType<typeof vi.fn>;

async function renderToday(): Promise<Rendered<Today>> {
  return render(Today);
}

function chip(page: Rendered<Today>, label: string): HTMLElement {
  const found = page.queryAll('button').find((b) => (b.textContent ?? '').trim() === label);
  if (!found) throw new Error(`no chip named ${label}`);
  return found;
}

describe('Today', () => {
  beforeEach(() => {
    resetIds();
    openTasks = signal<Task[]>([]);
    doneTasks = signal<Task[]>([]);
    openCount = signal(0);
    completedCount = signal(0);
    todaysCategories = signal<Category[]>([]);
    filter = signal<EnergyFilter>('all');
    categoryFilter = signal<string | null>(null);
    filtered = signal(false);
    upcomingCount = signal(0);
    upcomingOpen = signal(false);
    composerOpen = signal(false);

    setFilter = vi.fn();
    setCategoryFilter = vi.fn();
    clearFilters = vi.fn();
    toggleUpcoming = vi.fn();
    toggleComplete = vi.fn();
    reschedule = vi.fn();
    addFromCapture = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Nav,
          useValue: { composerOpen, collapsed: signal(false), openComposer: vi.fn() },
        },
        {
          provide: TaskStore,
          useValue: {
            openTasks,
            doneTasks,
            openCount,
            completedCount,
            todaysCategories,
            filter,
            categoryFilter,
            filtered,
            upcomingCount,
            upcomingOpen,
            upcoming: signal([]),
            categories: signal<Category[]>([]),
            categoryById: signal(new Map<string, Category>()),
            ensureLoaded: vi.fn(),
            setFilter,
            setCategoryFilter,
            clearFilters,
            toggleUpcoming,
            toggleComplete,
            reschedule,
            addFromCapture,
          },
        },
      ],
    });
  });

  describe('the header', () => {
    it('counts what is left when there is work to do', async () => {
      openCount.set(2);
      const page = await renderToday();
      expect(page.query('h1')?.textContent?.trim()).toBe('2 to go');
    });

    it('says the day is clear only once something has actually been finished', async () => {
      openCount.set(0);
      completedCount.set(1);
      const page = await renderToday();
      expect(page.query('h1')?.textContent?.trim()).toBe('All clear');
    });

    it('says nothing yet on a day that has not been started', async () => {
      const page = await renderToday();
      expect(page.query('h1')?.textContent?.trim()).toBe('Nothing yet');
    });

    it('reports what has been done today, once there is any', async () => {
      completedCount.set(3);
      openCount.set(1);
      const page = await renderToday();
      expect(page.el.textContent).toContain('3 done today');
    });

    it('says nothing about done work before any of it exists', async () => {
      const page = await renderToday();
      expect(page.el.textContent).not.toContain('done today');
    });
  });

  describe('the energy filter', () => {
    it('offers all three chips with the resting state first', async () => {
      const page = await renderToday();
      expect(chip(page, 'All')).toBeDefined();
      expect(chip(page, 'Quick')).toBeDefined();
      expect(chip(page, 'Deep')).toBeDefined();
    });

    it('reports which chip is the current filter', async () => {
      const page = await renderToday();
      expect(chip(page, 'All').getAttribute('aria-pressed')).toBe('true');
      expect(chip(page, 'Quick').getAttribute('aria-pressed')).toBe('false');

      filter.set('quick');
      await page.settle();

      expect(chip(page, 'Quick').getAttribute('aria-pressed')).toBe('true');
      expect(chip(page, 'All').getAttribute('aria-pressed')).toBe('false');
    });

    it('sets the filter through the store', async () => {
      const page = await renderToday();
      await page.click(chip(page, 'Deep'));

      expect(setFilter).toHaveBeenCalledWith('deep');
    });
  });

  describe('the category filter', () => {
    it('stays hidden while nothing today carries a category', async () => {
      const page = await renderToday();
      expect(page.el.textContent).not.toContain('Health');
    });

    it('offers only the categories with something on today', async () => {
      todaysCategories.set([makeCategory({ name: 'Health' })]);
      const page = await renderToday();

      expect(chip(page, 'Health')).toBeDefined();
    });

    it('reports which category is filtering', async () => {
      const health = makeCategory({ name: 'Health' });
      todaysCategories.set([health]);
      categoryFilter.set(health.id);
      const page = await renderToday();

      expect(chip(page, 'Health').getAttribute('aria-pressed')).toBe('true');
    });

    it('applies a category that is not already filtering', async () => {
      const health = makeCategory({ name: 'Health' });
      todaysCategories.set([health]);
      const page = await renderToday();

      await page.click(chip(page, 'Health'));

      expect(setCategoryFilter).toHaveBeenCalledWith(health.id);
    });

    it('clears the one already filtering, so no separate "All" is needed', async () => {
      const health = makeCategory({ name: 'Health' });
      todaysCategories.set([health]);
      categoryFilter.set(health.id);
      const page = await renderToday();

      await page.click(chip(page, 'Health'));

      expect(setCategoryFilter).toHaveBeenCalledWith(null);
    });
  });

  describe('the empty list', () => {
    it('invites a first task on a day nothing has happened on', async () => {
      const page = await renderToday();
      expect(page.el.textContent).toContain('Write the first thing down.');
    });

    it('congratulates a day that is finished rather than inviting more work', async () => {
      doneTasks.set([makeDoneTask()]);
      const page = await renderToday();

      expect(page.el.textContent).toContain('All clear for today.');
      expect(page.el.textContent).not.toContain('Write the first thing down.');
    });

    it('blames the filter only when the filter hid everything', async () => {
      filtered.set(true);
      const page = await renderToday();

      expect(page.el.textContent).toContain('Nothing matches that filter today.');
    });

    it('prefers the finished day to the filter when work did match', async () => {
      filtered.set(true);
      doneTasks.set([makeDoneTask()]);
      const page = await renderToday();

      expect(page.el.textContent).toContain('All clear for today.');
      expect(page.el.textContent).not.toContain('Nothing matches that filter today.');
    });

    it('offers a way out of a filter that is hiding everything', async () => {
      filtered.set(true);
      const page = await renderToday();

      await page.click(page.byText('button', 'Clear filters') as HTMLElement);

      expect(clearFilters).toHaveBeenCalledTimes(1);
    });

    it('does not ask twice, so the trailing add row stays off an empty list', async () => {
      const page = await renderToday();
      expect(page.byText('button', 'Add task')).toBeNull();
    });
  });

  it('offers an add row at the end of a list that has something in it', async () => {
    openTasks.set([makeTask()]);
    const page = await renderToday();

    expect(page.byText('button', 'Add task')).not.toBeNull();
  });

  it('opens the composer from the end of the list', async () => {
    openTasks.set([makeTask()]);
    const page = await renderToday();
    await page.click(page.byText('button', 'Add task') as HTMLElement);

    expect(page.query('app-composer')).not.toBeNull();
  });

  it('opens the composer when the drawer asks for it from another page', async () => {
    const page = await renderToday();
    expect(page.query('app-composer')).toBeNull();

    composerOpen.set(true);
    await page.settle();

    expect(page.query('app-composer')).not.toBeNull();
  });

  it('hands a committed task to the store', async () => {
    composerOpen.set(true);
    const page = await renderToday();

    const area = page.query('textarea') as HTMLTextAreaElement;
    area.value = 'call physio';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await page.settle();
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await page.settle();

    expect(addFromCapture).toHaveBeenCalledWith('call physio', null);
    expect(page.query('app-composer')).toBeNull();
  });

  describe('the done section', () => {
    it('is absent until something has been finished', async () => {
      const page = await renderToday();
      expect(page.byText('button', 'Done today')).toBeNull();
    });

    it('opens by default, so a completing row is seen travelling into it', async () => {
      doneTasks.set([makeDoneTask({ text: 'finished thing' })]);
      const page = await renderToday();

      expect(page.byText('button', 'Done today')?.getAttribute('aria-expanded')).toBe('true');
      expect(page.el.textContent).toContain('finished thing');
    });

    it('collapses on request', async () => {
      doneTasks.set([makeDoneTask({ text: 'finished thing' })]);
      const page = await renderToday();

      await page.click(page.byText('button', 'Done today') as HTMLElement);

      expect(page.byText('button', 'Done today')?.getAttribute('aria-expanded')).toBe('false');
      expect(page.el.textContent).not.toContain('finished thing');
    });

    it('counts what is in it', async () => {
      doneTasks.set([makeDoneTask(), makeDoneTask()]);
      const page = await renderToday();

      expect(page.byText('button', 'Done today')?.textContent).toContain('2');
    });
  });

  describe('the next seven days strip', () => {
    it('stays out of the way when there is nothing ahead', async () => {
      const page = await renderToday();
      expect(page.byText('button', 'Next 7 days')).toBeNull();
    });

    it('is collapsed by default, unlike the done section', async () => {
      upcomingCount.set(4);
      const page = await renderToday();

      expect(page.byText('button', 'Next 7 days')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('toggles through the store, since the state outlives this page', async () => {
      upcomingCount.set(4);
      const page = await renderToday();
      await page.click(page.byText('button', 'Next 7 days') as HTMLElement);

      expect(toggleUpcoming).toHaveBeenCalledTimes(1);
    });
  });

  it('completes a row through the store', async () => {
    const task = makeTask();
    openTasks.set([task]);
    const page = await renderToday();

    await page.click(
      page
        .queryAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Mark as done') as HTMLElement,
    );

    expect(toggleComplete).toHaveBeenCalledWith(task);
  });

  it('pushes a row on by one day from its own date', async () => {
    const task = makeTask({ scheduled_date: todayDate() });
    openTasks.set([task]);
    const page = await renderToday();

    await page.click(
      page
        .queryAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Move to Tomorrow') as HTMLElement,
    );

    expect(reschedule).toHaveBeenCalledWith(task, addDays(todayDate(), 1));
  });
});
