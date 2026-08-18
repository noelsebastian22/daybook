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

/** "9:15 AM" from a timestamptz string. */
export function friendlyTime(ts: string): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney';
  } catch {
    return 'Australia/Sydney';
  }
}
