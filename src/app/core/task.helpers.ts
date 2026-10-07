/**
 * Pure helpers for `task.store.ts`.
 *
 * Everything here is a plain function over plain data: no store, no injection,
 * no clock beyond what the caller passes in. That is the whole point — the
 * store's selectors and methods reduce to composition, and the logic worth
 * getting wrong can be tested without standing up an injector.
 *
 * Nothing in this file may reach for `today()` on its own. A helper that reads
 * the clock is a helper that cannot be tested against a fixed day, and rollover
 * bugs are exactly the kind that only show up on the wrong day.
 */

import type { DaySnapshot, Energy, Task } from './models';

/** The energy filter, plus the "no filter" case. Re-exported by `task.store.ts`. */
export type EnergyFilter = 'all' | Energy;

/** One day's worth of scheduled work, as the Upcoming strip renders it. */
export interface UpcomingDay {
  date: string;
  tasks: Task[];
}

/** Open tasks first, then completed, newest completion last. */
export function sortForDay(a: Task, b: Task): number {
  if (!a.completed_at && b.completed_at) return -1;
  if (a.completed_at && !b.completed_at) return 1;
  if (a.completed_at && b.completed_at) return a.completed_at.localeCompare(b.completed_at);
  return a.created_at.localeCompare(b.created_at);
}

/** Everything scheduled on `day`, in the order the day's list shows it. */
export function tasksForDay(tasks: Task[], day: string): Task[] {
  return tasks.filter((t) => t.scheduled_date === day).sort(sortForDay);
}

/**
 * Energy and category filter together, as an AND. They answer different
 * questions — "how much focus have I got" and "which part of my life" — so
 * making them exclusive would force a pointless choice between them.
 */
export function filterTasks(tasks: Task[], energy: EnergyFilter, category: string | null): Task[] {
  return tasks.filter(
    (t) =>
      (energy === 'all' || t.energy === energy) &&
      (category === null || t.category_id === category),
  );
}

/**
 * Open tasks scheduled between `start` and `end` inclusive, bucketed by day
 * and sorted by date. Days with nothing on them are absent rather than empty:
 * the strip lists the days that have work, not the days that exist.
 */
export function groupUpcoming(tasks: Task[], start: string, end: string): UpcomingDay[] {
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.completed_at) continue;
    if (t.scheduled_date < start || t.scheduled_date > end) continue;
    const bucket = byDay.get(t.scheduled_date) ?? [];
    bucket.push(t);
    byDay.set(t.scheduled_date, bucket);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayTasks]) => ({ date, tasks: dayTasks }));
}

/** Open tasks scheduled between `start` and `end` inclusive. */
export function countOpenBetween(tasks: Task[], start: string, end: string): number {
  return tasks.filter(
    (t) => !t.completed_at && t.scheduled_date >= start && t.scheduled_date <= end,
  ).length;
}

/** Scheduled, still-open task count per day. The calendar's future half. */
export function countOpenByDate(tasks: Task[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (t.completed_at) continue;
    counts.set(t.scheduled_date, (counts.get(t.scheduled_date) ?? 0) + 1);
  }
  return counts;
}

/**
 * Merges by id, so a range load never drops what another view is showing.
 * `incoming` wins on a collision — it is the fresher read.
 */
export function mergeTasksById(current: Task[], incoming: Task[]): Task[] {
  const byId = new Map(current.map((t) => [t.id, t]));
  for (const t of incoming) byId.set(t.id, t);
  return [...byId.values()];
}

/** The same merge for day snapshots, keyed on date and kept in date order. */
export function mergeSnapshots(current: DaySnapshot[], incoming: DaySnapshot[]): DaySnapshot[] {
  const byDate = new Map(current.map((s) => [s.date, s]));
  for (const s of incoming) byDate.set(s.date, s);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * A fresh read of the load window laid over what is held: rows inside the
 * window are replaced wholesale, so one deleted or moved elsewhere (by Claude,
 * by another device) disappears here too; rows outside it — calendar pages
 * read with `loadRange` — are kept, because this read says nothing about them.
 */
export function replaceWindow(current: Task[], fresh: Task[], from: string, to: string): Task[] {
  const outside = current.filter((t) => t.scheduled_date < from || t.scheduled_date > to);
  const freshIds = new Set(fresh.map((t) => t.id));
  return [...outside.filter((t) => !freshIds.has(t.id)), ...fresh];
}

export { resolveScheduling } from '../../../supabase/functions/_shared/domain/task-rules.ts';

/**
 * The task's current values for exactly the fields `patch` is about to change
 * — the rollback for an optimistic update. Taken from the task the caller
 * already holds rather than re-read, so it costs nothing and cannot race.
 */
export function fieldsOf(task: Task, patch: Partial<Task>): Partial<Task> {
  const before: Partial<Task> = {};
  for (const key of Object.keys(patch) as Array<keyof Task>) {
    Object.assign(before, { [key]: task[key] });
  }
  return before;
}

/**
 * How many tasks the `rollover_and_snapshot` RPC carried forward.
 *
 * The function returns a one-row set, so the payload is an array with a single
 * record in it. Anything else — an empty set, a shape that changed under us —
 * reads as zero rather than throwing: a wrong count is a cosmetic toast, and
 * the rollover itself has already happened server-side either way.
 */
export function rolledCount(data: unknown): number {
  if (!Array.isArray(data)) return 0;
  const first: unknown = data[0];
  if (typeof first !== 'object' || first === null || !('rolled_count' in first)) return 0;
  const value: unknown = (first as { rolled_count: unknown }).rolled_count;
  return typeof value === 'number' ? value : 0;
}
