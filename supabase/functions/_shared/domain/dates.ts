/**
 * Calendar-day arithmetic. A day is a local calendar date rendered as
 * YYYY-MM-DD. Never use toISOString() for this: it converts to UTC first,
 * which in Sydney puts anything before 10am on the previous day.
 *
 * "Local" means the runtime's zone. In the browser that is the user's device;
 * on an Edge Function it is UTC, which is why a server caller converts an
 * instant to the user's wall clock first (`zone.ts`) and only then uses these.
 */

export function toLocalDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, n: number): string {
  const d = fromLocalDate(date);
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}

/** True for a real YYYY-MM-DD calendar date, so 2026-02-30 is false. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toLocalDate(fromLocalDate(value)) === value;
}
