/**
 * The `mcp` function's pure half: limits, how a task is shown to a model, and
 * the shape of a tool result. No Deno, no Supabase, so `core.test.mjs` can run
 * it under plain Node — same arrangement as `access/core.ts`.
 */
import type { Category, Energy, Task } from '../_shared/domain/models.ts';
import { addDays, fromLocalDate, isIsoDate } from '../_shared/domain/dates.ts';

/**
 * Every list is bounded, so no tool can ask for "everything" (MCP-PLAN §8).
 * `upcomingDays` matches the Upcoming page's three weeks of paging.
 */
export const LIMITS = {
  upcomingDays: 21,
  reviewDays: 92,
  reviewDefaultDays: 14,
  topListSize: 5,
  findDefault: 25,
  findMax: 100,
  /** Rows read before a text filter runs, so a search stays one query. */
  findScan: 500,
  captureMax: 20,
  idsMax: 50,
  textMax: 500,
  notesMax: 5000,
} as const;

/** A task as a tool returns it: the row, with the category as its slug. */
export interface TaskView {
  id: string;
  text: string;
  date: string;
  done_at: string | null;
  reminder_at: string | null;
  category: string | null;
  energy: Energy | null;
  notes: string | null;
  /** Times the app carried it over because it was not done. */
  carried: number;
  /** Times the user moved it by hand. */
  pushed: number;
}

export function viewOf(task: Task, categories: Map<string, Category>): TaskView {
  return {
    id: task.id,
    text: task.text,
    date: task.scheduled_date,
    done_at: task.completed_at,
    reminder_at: task.reminder_at,
    category: task.category_id ? (categories.get(task.category_id)?.slug ?? null) : null,
    energy: task.energy,
    notes: task.notes,
    carried: task.carried_over_count,
    pushed: task.reschedule_count,
  };
}

const weekday = new Intl.DateTimeFormat('en-AU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** "today", "tomorrow", "yesterday", otherwise "Thu 8 Oct". */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  if (date === addDays(today, -1)) return 'yesterday';
  return weekday.format(fromLocalDate(date)).replace(',', '');
}

const clocks = new Map<string, Intl.DateTimeFormat>();

/** "14:00" for an instant, on the user's clock. */
export function clockIn(iso: string, timeZone: string): string {
  let f = clocks.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-AU', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    clocks.set(timeZone, f);
  }
  return f.format(new Date(iso));
}

/**
 * One line per task, for the text half of a result — the half every client
 * shows. The id goes last, so the line reads as a sentence and Claude still
 * has what it needs to act on the task.
 *
 *   call physio · 14:00 · #health · quick · carried ×2 · has notes (id 0f…)
 */
export function lineOf(view: TaskView, timeZone: string, today: string, showDay = false): string {
  const parts = [view.text];
  if (showDay) parts.push(dayLabel(view.date, today));
  if (view.done_at) parts.push(`done ${clockIn(view.done_at, timeZone)}`);
  else if (view.reminder_at) parts.push(clockIn(view.reminder_at, timeZone));
  if (view.category) parts.push(`#${view.category}`);
  if (view.energy) parts.push(view.energy);
  if (view.carried > 0) parts.push(`carried ×${view.carried}`);
  if (view.pushed > 0) parts.push(`pushed ×${view.pushed}`);
  if (view.notes) parts.push('has notes');
  return `- ${parts.join(' · ')} (id ${view.id})`;
}

/** Open first in the order written, then done in the order finished. */
export function sortForDay(a: TaskView, b: TaskView): number {
  if (!a.done_at !== !b.done_at) return a.done_at ? 1 : -1;
  if (a.done_at && b.done_at) return a.done_at.localeCompare(b.done_at);
  return 0;
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function ok(text: string, structured?: Record<string, unknown>): ToolResult {
  return structured
    ? { content: [{ type: 'text', text }], structuredContent: structured }
    : { content: [{ type: 'text', text }] };
}

/** A failure the model can act on: what went wrong, and what to do instead. */
export function fail(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** Every word of `query` appears in the text or the notes, any case. */
export function matchesQuery(task: Pick<Task, 'text' | 'notes'>, query: string): boolean {
  const haystack = `${task.text}\n${task.notes ?? ''}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * A from–to range, defaulted and capped. Returns an error sentence rather
 * than throwing, so it can go straight back to the model.
 */
export function checkRange(
  from: string,
  to: string,
  maxDays: number,
): { from: string; to: string } | { error: string } {
  if (!isIsoDate(from) || !isIsoDate(to)) return { error: 'Dates must be YYYY-MM-DD.' };
  if (from > to) return { error: `"from" (${from}) is after "to" (${to}).` };
  if (addDays(from, maxDays - 1) < to) {
    return { error: `That range is longer than ${maxDays} days. Ask for a shorter one.` };
  }
  return { from, to };
}

/** A "HH:MM" 24-hour time, or null when it is not one. */
export function parseClock(value: string): { h: number; m: number } | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? { h: Number(match[1]), m: Number(match[2]) } : null;
}

/** A category slug as `#tag` would produce it. */
export function normaliseSlug(value: string): string | null {
  const slug = value.trim().replace(/^#/, '').toLowerCase();
  return /^[\p{L}\p{N}_-]+$/u.test(slug) ? slug : null;
}
