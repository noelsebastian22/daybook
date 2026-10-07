import type { DaySnapshot, Task } from './models.ts';
import { addDays } from './dates.ts';

/**
 * The weekly review's lists, shared by the Reporting page and the `mcp`
 * function's `get_review`.
 */

export type CounterField = 'carried_over_count' | 'reschedule_count';

/**
 * The open tasks with the highest count on one counter. Open only: a finished
 * task's history is no longer a warning. Ties keep their incoming order.
 */
export function topBy(tasks: Task[], field: CounterField, size: number): Task[] {
  return tasks
    .filter((t) => !t.completed_at && t[field] > 0)
    .sort((a, b) => b[field] - a[field])
    .slice(0, size);
}

export interface DayCount {
  date: string;
  completed: number;
  /** No snapshot and not today: the app was never opened that day. */
  unrecorded: boolean;
}

/**
 * Completed per day across `from..to`. Today has no snapshot yet — the row is
 * written by the next rollover — so its live count is passed in.
 */
export function completedPerDay(
  snapshots: DaySnapshot[],
  from: string,
  to: string,
  today: string,
  completedToday: number,
): DayCount[] {
  const byDate = new Map(snapshots.map((s) => [s.date, s]));
  const out: DayCount[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const s = byDate.get(d);
    out.push({
      date: d,
      completed: d === today ? completedToday : (s?.completed_count ?? 0),
      unrecorded: d !== today && !s,
    });
  }
  return out;
}
