import { describe, expect, it, vi } from 'vitest';

import { addDays, addMonths, daysInMonth, friendlyDate, startOfMonth, today } from '../core/dates';
import { render, type Rendered } from '../../testing/render';
import { DatePicker, type PickedDate } from './date-picker';
import { shortcutsFor } from './date-picker.data';

/**
 * The picker owns no value — it reports a choice and closes. Everything here
 * is about what it offers and what it refuses to offer: no "No Date", no
 * "Repeat", and no day already behind the user.
 */

async function renderPicker(
  inputs: { date?: string; time?: string | null } = {},
): Promise<Rendered<DatePicker>> {
  return render(DatePicker, { inputs: { date: today(), ...inputs } });
}

/** The day cells, which are the only buttons whose whole label is a number. */
function dayCells(picker: Rendered<DatePicker>): HTMLButtonElement[] {
  return picker
    .queryAll('button')
    .filter((b) => /^\d+$/.test((b.textContent ?? '').trim())) as HTMLButtonElement[];
}

function shortcutNamed(picker: Rendered<DatePicker>, label: string): HTMLElement {
  const found = picker
    .queryAll('button')
    .find((b) => (b.getAttribute('aria-label') ?? '').startsWith(`${label},`));
  if (!found) throw new Error(`no ${label} shortcut`);
  return found;
}

describe('shortcutsFor', () => {
  it('offers the four fixed rows on a plain weekday', () => {
    // A Tuesday, so nothing collapses into anything else.
    expect(shortcutsFor('2026-08-18').map((s) => s.label)).toEqual([
      'Today',
      'Tomorrow',
      'This weekend',
      'Next week',
    ]);
  });

  it('drops "This weekend" on a Friday, where it would repeat Tomorrow', () => {
    const labels = shortcutsFor('2026-08-21').map((s) => s.label);
    expect(labels).toEqual(['Today', 'Tomorrow', 'Next week']);
  });

  it('collapses to two rows on a Sunday, where the weekend is today and next week is tomorrow', () => {
    // comingSaturday() returns Sunday itself, and comingMonday() returns the
    // very next day, so both fixed rows land on days already offered above.
    const labels = shortcutsFor('2026-08-23').map((s) => s.label);
    expect(labels).toEqual(['Today', 'Tomorrow']);
  });

  it('resolves the days it names against the day it is given', () => {
    const rows = shortcutsFor('2026-08-18');
    expect(rows[0].date).toBe('2026-08-18');
    expect(rows[1].date).toBe('2026-08-19');
  });

  it('never offers "No Date" or "Repeat", which have no column behind them', () => {
    const labels = shortcutsFor('2026-08-18').map((s) => s.label);
    expect(labels).not.toContain('No Date');
    expect(labels).not.toContain('Repeat');
  });
});

describe('DatePicker', () => {
  it('is a labelled dialog', async () => {
    const picker = await renderPicker();
    const dialog = picker.query('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('Choose a date');
  });

  it('offers a way out that is not the keyboard', async () => {
    const picker = await renderPicker();
    const closed = vi.fn();
    picker.component.closed.subscribe(closed);

    const backdrop = picker
      .queryAll('button')
      .find((b) => b.getAttribute('aria-label') === 'Close the date picker');
    expect(backdrop).toBeDefined();

    await picker.click(backdrop as HTMLElement);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const picker = await renderPicker();
    const closed = vi.fn();
    picker.component.closed.subscribe(closed);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await picker.settle();

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('spells each shortcut out for a screen reader, resolved day included', async () => {
    const picker = await renderPicker();
    const tomorrow = addDays(today(), 1);
    expect(shortcutNamed(picker, 'Tomorrow').getAttribute('aria-label')).toBe(
      `Tomorrow, ${friendlyDate(tomorrow)}`,
    );
  });

  it('reports the chosen day and closes behind it', async () => {
    const picker = await renderPicker();
    const picked = vi.fn<(p: PickedDate) => void>();
    const closed = vi.fn();
    picker.component.picked.subscribe(picked);
    picker.component.closed.subscribe(closed);

    await picker.click(shortcutNamed(picker, 'Tomorrow'));

    expect(picked).toHaveBeenCalledWith({ date: addDays(today(), 1), time: null });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('carries the time already set through a day change', async () => {
    const picker = await renderPicker({ time: '14:00' });
    const picked = vi.fn<(p: PickedDate) => void>();
    picker.component.picked.subscribe(picked);

    await picker.click(shortcutNamed(picker, 'Tomorrow'));

    expect(picked).toHaveBeenCalledWith({ date: addDays(today(), 1), time: '14:00' });
  });

  describe('the month grid', () => {
    it('draws every day of the month on screen and no more', async () => {
      const picker = await renderPicker();
      expect(dayCells(picker)).toHaveLength(daysInMonth(startOfMonth(today())));
    });

    it('opens on the month of the day it was given', async () => {
      const far = addMonths(today(), 2);
      const picker = await renderPicker({ date: far });
      expect(dayCells(picker)).toHaveLength(daysInMonth(far));
    });

    it('marks the current selection pressed, and nothing else', async () => {
      const picker = await renderPicker();
      const pressed = dayCells(picker).filter((b) => b.getAttribute('aria-pressed') === 'true');
      expect(pressed).toHaveLength(1);
      expect(pressed[0].getAttribute('aria-label')).toBe('Today');
    });

    it('names each day in full, since the number alone says nothing', async () => {
      const picker = await renderPicker();
      const labelled = dayCells(picker).filter((b) => b.getAttribute('aria-label'));
      expect(labelled).toHaveLength(dayCells(picker).length);
    });

    it('refuses every day already behind the user', async () => {
      const picker = await renderPicker();
      const first = startOfMonth(today());
      const expected = Array.from({ length: daysInMonth(first) }, (_, i) => addDays(first, i))
        .filter((date) => date < today())
        .map((date) => String(Number(date.slice(8))));

      const actual = dayCells(picker)
        .filter((b) => b.disabled)
        .map((b) => (b.textContent ?? '').trim());

      expect(actual).toEqual(expected);
    });

    it('leaves every day of a future month choosable', async () => {
      const picker = await renderPicker();
      await picker.click(
        picker
          .queryAll('button')
          .find((b) => b.getAttribute('aria-label') === 'Next month') as HTMLElement,
      );

      expect(dayCells(picker).filter((b) => b.disabled)).toEqual([]);
    });

    it('will not page back before the month the user is standing in', async () => {
      const picker = await renderPicker();
      const previous = picker
        .queryAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Previous month') as HTMLButtonElement;

      expect(previous.disabled).toBe(true);
    });

    it('lets the user come back once they have paged forward', async () => {
      const picker = await renderPicker();
      const named = (label: string) =>
        picker
          .queryAll('button')
          .find((b) => b.getAttribute('aria-label') === label) as HTMLButtonElement;

      await picker.click(named('Next month'));
      expect(named('Previous month').disabled).toBe(false);

      await picker.click(named('Previous month'));
      expect(named('Previous month').disabled).toBe(true);
    });

    it('reports the day pressed in the grid', async () => {
      const picker = await renderPicker();
      const picked = vi.fn<(p: PickedDate) => void>();
      picker.component.picked.subscribe(picked);

      const cell = dayCells(picker).find((b) => !b.disabled) as HTMLButtonElement;
      const label = cell.getAttribute('aria-label');
      await picker.click(cell);

      expect(picked).toHaveBeenCalledTimes(1);
      expect(friendlyDate(picked.mock.calls[0][0].date)).toBe(label);
    });

    it('hides the weekday headings, which are one letter and read as noise', async () => {
      const picker = await renderPicker();
      const headings = picker.queryAll('span[aria-hidden="true"]');
      expect(headings.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('the reminder time', () => {
    it('is a labelled field', async () => {
      const picker = await renderPicker();
      expect(picker.query('input[type="time"]')?.getAttribute('aria-label')).toBe('Reminder time');
    });

    it('reports a time against the day already chosen', async () => {
      const day = addDays(today(), 3);
      const picker = await renderPicker({ date: day });
      const picked = vi.fn<(p: PickedDate) => void>();
      picker.component.picked.subscribe(picked);

      const field = picker.query('input[type="time"]') as HTMLInputElement;
      field.value = '09:30';
      field.dispatchEvent(new Event('change', { bubbles: true }));
      await picker.settle();

      expect(picked).toHaveBeenCalledWith({ date: day, time: '09:30' });
    });

    it('treats an emptied field as no reminder at all', async () => {
      const picker = await renderPicker({ time: '09:30' });
      const picked = vi.fn<(p: PickedDate) => void>();
      picker.component.picked.subscribe(picked);

      const field = picker.query('input[type="time"]') as HTMLInputElement;
      field.value = '';
      field.dispatchEvent(new Event('change', { bubbles: true }));
      await picker.settle();

      expect(picked).toHaveBeenCalledWith({ date: today(), time: null });
    });

    it('offers a clear control only once there is a time to clear', async () => {
      const without = await renderPicker();
      const clearLabel = 'Clear the reminder time';
      expect(
        without.queryAll('button').some((b) => b.getAttribute('aria-label') === clearLabel),
      ).toBe(false);

      const withTime = await renderPicker({ time: '09:30' });
      const clear = withTime
        .queryAll('button')
        .find((b) => b.getAttribute('aria-label') === clearLabel);
      expect(clear).toBeDefined();

      const picked = vi.fn<(p: PickedDate) => void>();
      withTime.component.picked.subscribe(picked);
      await withTime.click(clear as HTMLElement);

      expect(picked).toHaveBeenCalledWith({ date: today(), time: null });
    });
  });
});
