import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addDays, friendlyDate, shortWeekday, today } from '../../core/dates';
import type { DaySnapshot, Task } from '../../core/models';
import { TaskStore } from '../../core/task.store';
import { makeDoneTask, makeSnapshot, makeTask, resetIds } from '../../../testing/fakes';
import { render, type Rendered } from '../../../testing/render';
import { CARRIED_ALARM_COUNT, LIST_SIZE, TREND_DAYS, WEEK_DAYS } from './reporting.constants';
import { Reporting } from './reporting';

/**
 * The weekly review. The chart and the table beneath it are the same numbers,
 * and both have to keep "the app was not opened" apart from "nothing was
 * done" — a dash and a hairline rather than a zero and a missing bar.
 */

let snapshots: WritableSignal<Map<string, DaySnapshot>>;
let tasks: WritableSignal<Task[]>;
let completedCount: WritableSignal<number>;
let openCount: WritableSignal<number>;

/** Day 0 of the fortnight the page draws. */
const START = addDays(today(), -(TREND_DAYS - 1));

function snapshotMap(rows: DaySnapshot[]): Map<string, DaySnapshot> {
  return new Map(rows.map((r) => [r.date, r]));
}

/** A snapshot for every day of the fortnight, so nothing reads as unopened. */
function everyDayRecorded(counts: Partial<Record<number, number>> = {}): DaySnapshot[] {
  return Array.from({ length: TREND_DAYS - 1 }, (_, i) =>
    makeSnapshot({ date: addDays(START, i), completed_count: counts[i] ?? 0 }),
  );
}

async function renderReporting(): Promise<Rendered<Reporting>> {
  return render(Reporting);
}

/** The table under "Show the numbers", which is the chart in words. */
function rows(page: Rendered<Reporting>): { day: string; count: string }[] {
  return page.queryAll('tbody tr').map((tr) => ({
    day: (tr.querySelector('th')?.textContent ?? '').trim(),
    count: (tr.querySelector('td')?.textContent ?? '').trim(),
  }));
}

function rowFor(page: Rendered<Reporting>, date: string): { day: string; count: string } {
  const row = rows(page).find((r) => r.day === friendlyDate(date));
  if (!row) throw new Error(`no row for ${date}`);
  return row;
}

describe('Reporting', () => {
  beforeEach(() => {
    resetIds();
    snapshots = signal(new Map<string, DaySnapshot>());
    tasks = signal<Task[]>([]);
    completedCount = signal(0);
    openCount = signal(0);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: TaskStore,
          useValue: {
            snapshotByDate: snapshots,
            tasks,
            completedCount,
            openCount,
            ensureLoaded: vi.fn(),
            loadSnapshots: vi.fn(),
          },
        },
      ],
    });
  });

  it('covers a fortnight, so there are two weeks to compare', async () => {
    const page = await renderReporting();
    expect(rows(page)).toHaveLength(TREND_DAYS);
  });

  it('offers the chart as numbers for anyone the bars do not serve', async () => {
    const page = await renderReporting();
    expect(page.byText('summary', 'Show the numbers')).not.toBeNull();
  });

  describe('a day with no snapshot row', () => {
    it('reads as a dash rather than a zero', async () => {
      snapshots.set(snapshotMap(everyDayRecorded()));
      const page = await renderReporting();
      const missing = addDays(START, 2);

      // Every day but this one has a row.
      snapshots.set(snapshotMap(everyDayRecorded().filter((s) => s.date !== missing)));
      await page.settle();

      // An en dash. The copy deck bans the em dash from anything a user
      // reads, and this cell used to be one.
      expect(rowFor(page, missing).count).toBe('–');
    });

    it('is not what a recorded day with nothing done looks like', async () => {
      snapshots.set(snapshotMap(everyDayRecorded()));
      const page = await renderReporting();

      expect(rowFor(page, addDays(START, 2)).count).toBe('0');
    });

    /**
     * These two counted every `aria-hidden` node on the page, which worked only
     * while the hairline was the single decorative thing in it. The axis, its
     * gridlines and the week divider are decorative too, so the count is now
     * taken on the mark itself.
     */
    it('draws a mark of its own in the chart instead of a bar', async () => {
      const page = await renderReporting();
      // Nothing is recorded at all, so every day but today is unrecorded.
      expect(page.queryAll('[data-mark="unrecorded"]')).toHaveLength(TREND_DAYS - 1);
    });

    it('leaves no such mark once every day has a row', async () => {
      snapshots.set(snapshotMap(everyDayRecorded()));
      const page = await renderReporting();

      expect(page.queryAll('[data-mark="unrecorded"]')).toEqual([]);
      expect(page.queryAll('[data-mark="bar"]')).toHaveLength(TREND_DAYS);
    });
  });

  it('stands the live count in for today, which has no snapshot yet', async () => {
    completedCount.set(4);
    const page = await renderReporting();

    expect(rowFor(page, today()).count).toBe('4');
  });

  describe('the headline', () => {
    it('sums the last seven days', async () => {
      snapshots.set(snapshotMap(everyDayRecorded({ 7: 2, 8: 3 })));
      completedCount.set(1);
      const page = await renderReporting();

      // Days 7..12 plus today, which is day 13.
      expect(page.el.textContent).toContain('Done this week');
      expect(page.queryAll('p').some((p) => p.textContent?.trim() === '6')).toBe(true);
    });

    it('says nothing was recorded last week rather than comparing against zero', async () => {
      completedCount.set(2);
      const page = await renderReporting();

      expect(page.el.textContent).toContain('nothing recorded last week');
    });

    it('calls two equal weeks level rather than plus zero', async () => {
      snapshots.set(snapshotMap(everyDayRecorded({ 0: 3, 7: 3 })));
      const page = await renderReporting();

      expect(page.el.textContent).toContain('level vs 3 last week');
    });

    it('signs a week that is up', async () => {
      snapshots.set(snapshotMap(everyDayRecorded({ 0: 1, 7: 4 })));
      const page = await renderReporting();

      expect(page.el.textContent).toContain('+3 vs 1 last week');
    });

    it('signs a week that is down', async () => {
      snapshots.set(snapshotMap(everyDayRecorded({ 0: 5, 7: 2 })));
      const page = await renderReporting();

      expect(page.el.textContent).toContain('-3 vs 5 last week');
    });

    it('reports what is still open today', async () => {
      openCount.set(7);
      const page = await renderReporting();

      expect(page.el.textContent).toContain('Open right now');
      expect(page.queryAll('p').some((p) => p.textContent?.trim() === '7')).toBe(true);
    });
  });

  describe('carried over most', () => {
    it('says so plainly when nothing has rolled over', async () => {
      const page = await renderReporting();
      expect(page.el.textContent).toContain('Nothing has rolled over. Rare and good.');
    });

    it('lists what the app keeps moving, worst first', async () => {
      tasks.set([
        makeTask({ text: 'twice', carried_over_count: 2 }),
        makeTask({ text: 'five times', carried_over_count: 5 }),
      ]);
      const page = await renderReporting();

      const listed = page.queryAll('section a').map((a) => (a.textContent ?? '').trim());
      expect(listed).toEqual(['five times', 'twice']);
    });

    it('leaves a finished task out, since its history is no longer a warning', async () => {
      tasks.set([
        makeDoneTask({ text: 'done but carried', carried_over_count: 4 }),
        makeTask({ text: 'still open', carried_over_count: 1 }),
      ]);
      const page = await renderReporting();

      expect(page.el.textContent).not.toContain('done but carried');
      expect(page.el.textContent).toContain('still open');
    });

    it('shows no more rows than the list is allowed', async () => {
      tasks.set(
        Array.from({ length: LIST_SIZE + 3 }, (_, i) =>
          makeTask({ text: `task ${i}`, carried_over_count: i + 1 }),
        ),
      );
      const page = await renderReporting();

      expect(page.queryAll('section a')).toHaveLength(LIST_SIZE);
    });

    it('counts the carries beside each row', async () => {
      tasks.set([makeTask({ text: 'call physio', carried_over_count: CARRIED_ALARM_COUNT })]);
      const page = await renderReporting();

      expect(page.byText('span', `×${CARRIED_ALARM_COUNT}`)).not.toBeNull();
    });
  });

  describe('pushed most', () => {
    it('says so plainly when nothing has been pushed', async () => {
      const page = await renderReporting();
      expect(page.el.textContent).toContain('Nothing pushed by hand yet.');
    });

    it('keeps what the app moved apart from what the user moved', async () => {
      tasks.set([
        makeTask({ text: 'app moved this', carried_over_count: 3 }),
        makeTask({ text: 'i moved this', reschedule_count: 2 }),
      ]);
      const page = await renderReporting();

      const sections = page.queryAll('section');
      const carried = sections.find((s) => s.textContent?.includes('Carried over most'));
      const pushed = sections.find((s) => s.textContent?.includes('Pushed most'));

      expect(carried?.textContent).toContain('app moved this');
      expect(carried?.textContent).not.toContain('i moved this');
      expect(pushed?.textContent).toContain('i moved this');
      expect(pushed?.textContent).not.toContain('app moved this');
    });
  });

  it('announces the hovered day politely', async () => {
    const page = await renderReporting();
    expect(page.query('[aria-live="polite"]')).not.toBeNull();
  });

  describe('the axis', () => {
    it('labels every other day, so a fortnight of them does not collide', async () => {
      const page = await renderReporting();
      const labels = page
        .queryAll('[data-mark="day-label"]')
        .map((s) => (s.textContent ?? '').trim())
        .filter((t) => t !== '');

      // The seven even columns, plus today, which is column 13 and odd.
      expect(labels).toHaveLength(TREND_DAYS / 2 + 1);
    });

    /**
     * Today is index 13 of 0..13, so the every-other rule skipped it and the
     * one column a reader is most likely to look for was the only unlabelled
     * one on the chart.
     */
    it('labels today, which the every-other rule stepped over', async () => {
      const page = await renderReporting();
      const labels = page.queryAll('[data-mark="day-label"]');

      expect((labels.at(-1)?.textContent ?? '').trim()).toBe(shortWeekday(today()));
    });

    /**
     * Every value on this chart used to be hover-only, and a phone has no
     * hover. The gridline values make a magnitude readable without touching
     * anything.
     */
    it('prints a scale, so reading a magnitude needs no hover', async () => {
      snapshots.set(snapshotMap(everyDayRecorded({ 0: 3 })));
      const page = await renderReporting();
      const ticks = page.queryAll('[data-mark="tick"]').map((t) => (t.textContent ?? '').trim());

      expect(ticks).toEqual(['4', '2', '0']);
    });

    /**
     * Heights came off the tallest day, so the top bar always touched the
     * ceiling and a best-day-of-three drew identically to a best-day-of-thirty.
     */
    it('scales against a round ceiling rather than against the tallest day', async () => {
      snapshots.set(snapshotMap(everyDayRecorded({ 0: 3 })));
      const page = await renderReporting();

      expect(page.queryAll('[data-mark="bar"]')[0].style.height).toBe('75%');
    });

    it('divides the fortnight where the headline compares across', async () => {
      const page = await renderReporting();
      expect(page.query('[data-mark="week-divider"]')).not.toBeNull();
    });
  });

  it('splits the fortnight evenly into this week and last', async () => {
    expect(TREND_DAYS - WEEK_DAYS).toBe(WEEK_DAYS);
  });
});
