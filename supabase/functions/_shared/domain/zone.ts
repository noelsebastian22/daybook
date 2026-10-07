import { toLocalDate } from './dates.ts';

/**
 * Time-zone conversion for callers whose runtime zone is not the user's — an
 * Edge Function runs in UTC, and "tomorrow 9am" typed at 8am in Sydney has to
 * mean Sydney's tomorrow at Sydney's 9am.
 *
 * The approach is a wall clock: a `Date` whose *runtime-local* fields read as
 * the user's local time. Everything that already reasons in local fields —
 * `toLocalDate`, `addDays`, chrono-node — then works unchanged, and the one
 * value that is a real instant (`reminder_at`) is converted back with
 * `wallToInstant`.
 *
 * Only meaningful where the runtime zone has no DST gaps, i.e. UTC. The
 * browser never calls these: its runtime zone is already the user's.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

interface Fields {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function fieldsIn(instant: Date, timeZone: string): Fields {
  const out: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    y: out['year'],
    mo: out['month'],
    d: out['day'],
    h: out['hour'] % 24,
    mi: out['minute'],
    s: out['second'],
  };
}

/** True when `timeZone` is an IANA name this runtime understands. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The instant `instant`, as a Date whose local fields read as `timeZone`'s. */
export function wallClock(instant: Date, timeZone: string): Date {
  const f = fieldsIn(instant, timeZone);
  return new Date(f.y, f.mo - 1, f.d, f.h, f.mi, f.s, instant.getMilliseconds());
}

/** Milliseconds `timeZone` is ahead of UTC at `instant`. */
function offsetAt(instant: number, timeZone: string): number {
  const f = fieldsIn(new Date(instant), timeZone);
  const asUtc = Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s);
  return asUtc - (instant - (((instant % 1000) + 1000) % 1000));
}

/**
 * The inverse of `wallClock`: the real instant at which `timeZone`'s clocks
 * read `wall`'s local fields.
 *
 * Two passes, because the offset to subtract is the one in force at the
 * answer, not at the guess — they differ only within an hour of a DST change.
 * A wall time inside a spring-forward gap does not exist; it resolves to the
 * instant one offset-difference later, the way most calendars do.
 */
export function wallToInstant(wall: Date, timeZone: string): Date {
  const asUtc = Date.UTC(
    wall.getFullYear(),
    wall.getMonth(),
    wall.getDate(),
    wall.getHours(),
    wall.getMinutes(),
    wall.getSeconds(),
    wall.getMilliseconds(),
  );
  let t = asUtc - offsetAt(asUtc, timeZone);
  const second = asUtc - offsetAt(t, timeZone);
  if (second !== t) t = second;
  return new Date(t);
}

/** Today's calendar date in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return toLocalDate(wallClock(now, timeZone));
}
