/**
 * Date helpers.
 *
 * Everything the app calls "a day" is a local calendar date rendered as
 * YYYY-MM-DD. Never use toISOString() for this: it converts to UTC first,
 * which in Sydney puts anything before 10am on the previous day.
 */

export function toLocalDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toLocalDate();
}

export function addDays(date: string, n: number): string {
  const d = fromLocalDate(date);
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}

export function fromLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isPast(date: string): boolean {
  return date < today();
}

export function isFuture(date: string): boolean {
  return date > today();
}

/** "Today", "Tomorrow", "Yesterday", otherwise "Thu 21 Aug". */
export function friendlyDate(date: string): string {
  const t = today();
  if (date === t) return 'Today';
  if (date === addDays(t, 1)) return 'Tomorrow';
  if (date === addDays(t, -1)) return 'Yesterday';
  return fromLocalDate(date).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "Sat" — short weekday name, for places too narrow for a full date. */
export function shortWeekday(date: string): string {
  return fromLocalDate(date).toLocaleDateString(undefined, { weekday: 'short' });
}

/** "Mon 24 Aug" — weekday plus date, for anything more than a few days out. */
export function weekdayAndDate(date: string): string {
  return fromLocalDate(date).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "9:15 AM" from a timestamptz string. */
export function friendlyTime(ts: string): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "2:00 PM" from a local "HH:MM". */
export function friendlyClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Local "HH:MM" from a timestamptz, for an `<input type="time">`. */
export function timeOfDay(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * A local day plus "HH:MM" as an instant, for `reminder_at`.
 *
 * toISOString() is correct here and only here: a reminder is a moment in
 * time, not a calendar day. Everything above deals in calendar days and must
 * never touch it.
 */
export function toTimestamp(date: string, time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = fromLocalDate(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/* ------------------------------------------------------------------
   Month grid and shortcut helpers, for the date picker.
   ------------------------------------------------------------------ */

/** The first of the month `date` falls in. */
export function startOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`;
}

/** Always counted from the first of the month, so a short month cannot overflow. */
export function addMonths(date: string, n: number): string {
  const d = fromLocalDate(startOfMonth(date));
  d.setMonth(d.getMonth() + n);
  return toLocalDate(d);
}

export function daysInMonth(date: string): number {
  const d = fromLocalDate(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Monday is 0. The grid and "next week" both start the week on Monday. */
export function weekdayIndex(date: string): number {
  return (fromLocalDate(date).getDay() + 6) % 7;
}

/** "August 2026". */
export function monthLabel(date: string): string {
  return fromLocalDate(date).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * The coming Saturday. On a Sunday the weekend is already here, so it is
 * today — the picker then drops the shortcut as a duplicate of Today rather
 * than offering a "this weekend" six days away.
 */
export function comingSaturday(from: string = today()): string {
  const day = fromLocalDate(from).getDay();
  return day === 0 ? from : addDays(from, 6 - day);
}

/** The next Monday. Never today, so on a Monday it is a week out. */
export function comingMonday(from: string = today()): string {
  const day = fromLocalDate(from).getDay();
  return addDays(from, (8 - day) % 7 || 7);
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney';
  } catch {
    return 'Australia/Sydney';
  }
}
