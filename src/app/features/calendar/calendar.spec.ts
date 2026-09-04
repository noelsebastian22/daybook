import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addDays,
  addMonths,
  daysInMonth,
  friendlyDate,
  monthLabel,
  startOfMonth,
  today,
} from '../../core/dates';
import type { DaySnapshot } from '../../core/models';
import { TaskStore } from '../../core/task.store';
import { makeSnapshot } from '../../../testing/fakes';
import { render, type Rendered } from '../../../testing/render';
import { Calendar } from './calendar';

/**
 * The calendar's one hard idea: a past day with no `day_snapshots` row is a
 * day the app was never opened, and that is not the same as a day where
 * nothing was done. Both score zero on the heat scale, so the only thing
 * telling them apart is the hairline and the label — which is exactly why
 * they are easy to destroy.
 */

let snapshots: WritableSignal<Map<string, DaySnapshot>>;
let scheduled: WritableSignal<Map<string, number>>;
let loadSnapshots: ReturnType<typeof vi.fn>;
let loadRange: ReturnType<typeof vi.fn>;

const THIS_MONTH = startOfMonth(today());
const LAST_MONTH = addMonths(THIS_MONTH, -1);
const NEXT_MONTH = addMonths(THIS_MONTH, 1);

function snapshotMap(rows: DaySnapshot[]): Map<string, DaySnapshot> {
  return new Map(rows.map((r) => [r.date, r]));
}

async function renderCalendar(): Promise<Rendered<Calendar>> {
  return render(Calendar);
}

function cellFor(cal: Rendered<Calendar>, date: string): HTMLElement {
  const wanted = `${friendlyDate(date)},`;
  const cell = cal
    .queryAll('a')
    .find((a) => (a.getAttribute('aria-label') ?? '').startsWith(wanted));
  if (!cell) throw new Error(`no cell for ${date}`);
  return cell;
}

function pageTo(cal: Rendered<Calendar>, label: string): Promise<void> {
  const button = cal
    .queryAll('button')
    .find((b) => b.getAttribute('aria-label') === label) as HTMLElement;
  return cal.click(button);
}

describe('Calendar', () => {
  beforeEach(() => {
    snapshots = signal(new Map<string, DaySnapshot>());
    scheduled = signal(new Map<string, number>());
    loadSnapshots = vi.fn();
    loadRange = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: TaskStore,
          useValue: {
            snapshotByDate: snapshots,
            openCountByDate: scheduled,
            loadSnapshots,
            loadRange,
            ensureLoaded: vi.fn(),
          },
        },
      ],
    });
  });

  it('opens on the month the user is standing in', async () => {
    const cal = await renderCalendar();
    expect(cal.el.textContent).toContain(monthLabel(THIS_MONTH));
  });

  it('draws every day of the month and no more', async () => {
    const cal = await renderCalendar();
    expect(cal.queryAll('a')).toHaveLength(daysInMonth(THIS_MONTH));
  });

  it('fetches the history and the tasks for whatever month is on screen', async () => {
    const cal = await renderCalendar();
    const last = addDays(THIS_MONTH, daysInMonth(THIS_MONTH) - 1);

    expect(loadSnapshots).toHaveBeenCalledWith(THIS_MONTH, last);
    expect(loadRange).toHaveBeenCalledWith(THIS_MONTH, last);
  });

  it('refetches when the user pages to another month', async () => {
    const cal = await renderCalendar();
    loadSnapshots.mockClear();

    await pageTo(cal, 'Next month');

    expect(loadSnapshots).toHaveBeenCalledWith(
      NEXT_MONTH,
      addDays(NEXT_MONTH, daysInMonth(NEXT_MONTH) - 1),
    );
  });

  it('comes home when Today is pressed', async () => {
    const cal = await renderCalendar();
    await pageTo(cal, 'Next month');
    expect(cal.el.textContent).toContain(monthLabel(NEXT_MONTH));

    await cal.click(cal.byText('button', 'Today') as HTMLElement);

    expect(cal.el.textContent).toContain(monthLabel(THIS_MONTH));
  });

  it('picks today out of the grid by name', async () => {
    const cal = await renderCalendar();
    expect(cellFor(cal, today()).getAttribute('aria-label')).toContain('Today');
  });

  describe('a day already gone', () => {
    const recorded = addDays(LAST_MONTH, 4);
    const busy = addDays(LAST_MONTH, 5);
    const avoided = addDays(LAST_MONTH, 6);
    const unrecorded = addDays(LAST_MONTH, 7);

    beforeEach(() => {
      snapshots.set(
        snapshotMap([
          makeSnapshot({ date: recorded, completed_count: 0 }),
          makeSnapshot({ date: busy, completed_count: 3 }),
          makeSnapshot({ date: avoided, completed_count: 1, carried_count: 2 }),
        ]),
      );
    });

    it('says the app was never opened when there is no snapshot row at all', async () => {
      const cal = await renderCalendar();
      await pageTo(cal, 'Previous month');

      expect(cellFor(cal, unrecorded).getAttribute('aria-label')).toBe(
        `${friendlyDate(unrecorded)}, app not opened`,
      );
    });

    it('says nothing was done when the row exists and reads zero', async () => {
      const cal = await renderCalendar();
      await pageTo(cal, 'Previous month');

      expect(cellFor(cal, recorded).getAttribute('aria-label')).toBe(
        `${friendlyDate(recorded)}, 0 done`,
      );
    });

    it('draws a mark on the unopened day that the empty day does not get', async () => {
      const cal = await renderCalendar();
      await pageTo(cal, 'Previous month');

      // Both score zero, so the heat scale cannot tell them apart. The extra
      // element in the cell is the whole of the difference.
      expect(cellFor(cal, unrecorded).style.background).toBe(
        cellFor(cal, recorded).style.background,
      );
      expect(cellFor(cal, unrecorded).querySelectorAll('span')).toHaveLength(
        cellFor(cal, recorded).querySelectorAll('span').length + 1,
      );
    });

    it('counts what was finished', async () => {
      const cal = await renderCalendar();
      await pageTo(cal, 'Previous month');

      expect(cellFor(cal, busy).getAttribute('aria-label')).toBe(`${friendlyDate(busy)}, 3 done`);
    });

    it('names what rolled off the day as well as what was finished', async () => {
      const cal = await renderCalendar();
      await pageTo(cal, 'Previous month');

      expect(cellFor(cal, avoided).getAttribute('aria-label')).toBe(
        `${friendlyDate(avoided)}, 1 done, 2 carried off`,
      );
    });

    it('paints a busier day more strongly than a quiet one', async () => {
      const cal = await renderCalendar();
      await pageTo(cal, 'Previous month');

      expect(cellFor(cal, busy).style.background).not.toBe(cellFor(cal, recorded).style.background);
    });

    it('never prints a scheduled count on a day already gone', async () => {
      const cal = await renderCalendar();
      await pageTo(cal, 'Previous month');

      expect((cellFor(cal, busy).textContent ?? '').trim()).toBe(String(Number(busy.slice(8))));
    });
  });

  describe('a day still ahead', () => {
    const full = addDays(NEXT_MONTH, 3);
    const empty = addDays(NEXT_MONTH, 4);

    beforeEach(() => scheduled.set(new Map([[full, 2]])));

    it('counts what is scheduled for it', async () => {
      const cal = await renderCalendar();
      await pageTo(cal, 'Next month');

      expect(cellFor(cal, full).getAttribute('aria-label')).toBe(
        `${friendlyDate(full)}, 2 scheduled`,
      );
      expect(cellFor(cal, full).textContent).toContain('2');
    });

    it('says so plainly when nothing is on it', async () => {
      const cal = await renderCalendar();
      await pageTo(cal, 'Next month');

      expect(cellFor(cal, empty).getAttribute('aria-label')).toBe(
        `${friendlyDate(empty)}, nothing scheduled`,
      );
    });

    it('is never tinted, because the heat scale measures completions', async () => {
      const cal = await renderCalendar();
      await pageTo(cal, 'Next month');

      expect(cellFor(cal, full).style.background).toBe('');
    });
  });

  it('explains all three devices in the legend', async () => {
    const cal = await renderCalendar();
    const legend = cal.el.textContent ?? '';

    expect(legend).toContain('Done');
    expect(legend).toContain('carried off');
    expect(legend).toContain('app not opened');
  });

  it('names every day cell, since a bare number says nothing on its own', async () => {
    const cal = await renderCalendar();
    const unnamed = cal.queryAll('a').filter((a) => !a.getAttribute('aria-label'));
    expect(unnamed).toEqual([]);
  });
});
