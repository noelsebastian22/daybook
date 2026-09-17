import { addDays, fromLocalDate } from '../../core/dates';

/**
 * Pure helpers for the welcome hero's try-it page.
 *
 * No clock and no injection, per AGENTS.md: every one of these takes the day
 * it should reason from as an argument. That is not ceremony — the hero
 * renders a live date, and a helper that read the wall clock itself could
 * not be tested against a fixed day without freezing global time.
 */

/** 1 for 1 January, 365 or 366 for 31 December. */
export function dayOfYear(date: string): number {
  const d = fromLocalDate(date);
  const start = new Date(d.getFullYear(), 0, 1);
  // Both are local midnights, so the difference is whole days and no
  // timezone maths is involved. Deliberately not toISOString — see
  // core/dates.ts for why that would be wrong here.
  return Math.round((d.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** 365, or 366 in a leap year. */
export function daysInYear(date: string): number {
  const year = fromLocalDate(date).getFullYear();
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 366 : 365;
}

/**
 * How a day is named when the page tells you a task went somewhere else:
 * "Saved to **Friday's** page."
 *
 * A weekday on its own is only unambiguous inside a week. Past that it needs
 * the date, or "Saved to Friday's page" for something five weeks out is a
 * small lie the user finds out about later.
 */
export function pageLabel(date: string, from: string): string {
  const d = fromLocalDate(date);
  if (date === addDays(from, 1)) return 'tomorrow';
  if (date === addDays(from, -1)) return 'yesterday';

  const withinTheWeek = (() => {
    for (let n = -6; n <= 6; n++) if (addDays(from, n) === date) return true;
    return false;
  })();

  return withinTheWeek
    ? d.toLocaleDateString(undefined, { weekday: 'long' })
    : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Thursday 17 September", the hero's date line. */
export function longDate(date: string): string {
  return fromLocalDate(date).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
