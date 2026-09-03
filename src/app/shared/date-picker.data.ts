import { addDays, comingMonday, comingSaturday, shortWeekday, weekdayAndDate } from '../core/dates';

export interface Shortcut {
  label: string;
  date: string;
  /** The resolved day, printed beside the label so the choice can be checked. */
  hint: string;
}

/** Monday first, matching the month grid below the shortcuts. */
export const WEEKDAY_HEADINGS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * The four shortcut rows, resolved against a given day.
 *
 * The list is fixed — Today, Tomorrow, This weekend, Next week — but the days
 * they land on are not, so this is a function of today rather than a constant.
 *
 * Deliberately missing, per BUILD-PLAN §9: **no "No Date"** — `scheduled_date`
 * is `not null` and the someday bucket is out of scope, so the control would
 * have to fail — and **no "Repeat"**, which has no column and no phase.
 */
export function shortcutsFor(today: string): Shortcut[] {
  const t = today;
  const all: Shortcut[] = [
    { label: 'Today', date: t, hint: shortWeekday(t) },
    { label: 'Tomorrow', date: addDays(t, 1), hint: shortWeekday(addDays(t, 1)) },
    { label: 'This weekend', date: comingSaturday(t), hint: shortWeekday(comingSaturday(t)) },
    { label: 'Next week', date: comingMonday(t), hint: weekdayAndDate(comingMonday(t)) },
  ];
  // On a Friday "This weekend" is Tomorrow, and on a weekend it is Today.
  // Two rows landing on the same day is noise, so the earlier one wins.
  const seen = new Set<string>();
  return all.filter((s) => (seen.has(s.date) ? false : (seen.add(s.date), true)));
}
