import type { Category, Scheduling, Task } from './models.ts';
import type { ParsedCapture } from './parse-capture.ts';

/**
 * What every action does to a task row, as data.
 *
 * The app applies these optimistically and queues them offline; the `mcp`
 * Edge Function writes them straight through. Either way it is the same patch,
 * which is the point: `carried_over_count` and `reschedule_count` are two
 * different questions (BUILD-PLAN §5, feature 10), and a second client that
 * moved a task without the right counter would quietly answer them wrong.
 *
 * `carried_over_count` appears nowhere below. Only `rollover_and_snapshot`
 * ever moves it. The patches name exactly the columns they touch, so the `mcp`
 * function's typed `Update` — which has no `carried_over_count` — accepts them,
 * and would refuse one that strayed.
 */

/**
 * Which day and reminder a capture lands on when the date picker was used as
 * well as the text.
 *
 * The picker wins, and it carries the reminder with it, so a picked day is
 * never paired with a time left behind on the day that was typed.
 *
 * The asymmetry is deliberate and is the whole reason this is one function
 * rather than two lines at each of its two call sites. The date falls back to
 * the parsed one with `??`; the reminder does not. A `scheduling` with a null
 * `reminder_at` means "no reminder", not "keep whatever the text said" — the
 * picker is the only control that can clear one.
 *
 * `ParsedCapture` is structurally a `Scheduling` plus extras, so a parse result
 * can be handed straight in.
 */
export function resolveScheduling(parsed: Scheduling, scheduling: Scheduling | null): Scheduling {
  return {
    scheduled_date: scheduling?.scheduled_date ?? parsed.scheduled_date,
    reminder_at: scheduling ? scheduling.reminder_at : parsed.reminder_at,
  };
}

export interface NewTaskInput {
  id: string;
  userId: string;
  parsed: ParsedCapture;
  scheduling: Scheduling | null;
  categoryId: string | null;
  notes: string | null;
  /** The user's calendar date, which `created_date` records. */
  today: string;
  now: Date;
}

/** A freshly captured task. Both counters start at zero. */
export function newTask(input: NewTaskInput): Task {
  const { scheduled_date, reminder_at } = resolveScheduling(input.parsed, input.scheduling);
  return {
    id: input.id,
    user_id: input.userId,
    text: input.parsed.text,
    created_date: input.today,
    scheduled_date,
    completed_at: null,
    energy: input.parsed.energy,
    category_id: input.categoryId,
    reminder_at,
    notes: input.notes,
    carried_over_count: 0,
    reschedule_count: 0,
    created_at: input.now.toISOString(),
  };
}

/**
 * An edit re-parsed from the capture line.
 *
 * Pushing the day later counts as a manual reschedule, the same as the row's
 * arrow button. Pulling it *earlier* does not: dragging work forward is not
 * avoidance, and counting it would poison the "what do I keep avoiding"
 * number.
 */
export function editPatch(
  task: Task,
  parsed: ParsedCapture,
  scheduling: Scheduling | null,
  categoryId: string | null,
  notes: string | null,
): Partial<Task> {
  const { scheduled_date, reminder_at } = resolveScheduling(parsed, scheduling);
  const patch: Partial<Task> = {
    text: parsed.text,
    energy: parsed.energy,
    category_id: categoryId,
    scheduled_date,
    reminder_at,
    notes,
  };
  if (scheduled_date > task.scheduled_date) {
    patch.reschedule_count = task.reschedule_count + 1;
  }
  return patch;
}

/**
 * Completing also pins `scheduled_date` to today, otherwise a task scheduled
 * for Friday and finished on Wednesday never shows up in Wednesday's log.
 */
export function completePatch(
  now: Date,
  today: string,
): Pick<Task, 'completed_at' | 'scheduled_date'> {
  return { completed_at: now.toISOString(), scheduled_date: today };
}

/** Un-ticking leaves the date where completing pinned it. */
export function reopenPatch(): Pick<Task, 'completed_at'> {
  return { completed_at: null };
}

/**
 * A manual push. Always counts, in either direction — undoing a push in the
 * app is another push, deliberately: the count measures how much a task has
 * been shoved about.
 */
export function reschedulePatch(
  task: Task,
  date: string,
): Pick<Task, 'scheduled_date' | 'reschedule_count'> {
  return { scheduled_date: date, reschedule_count: task.reschedule_count + 1 };
}

/**
 * A new category for an unknown `#slug`, which is created rather than
 * dropped. The name is the slug capitalised; the slug itself is never renamed
 * afterwards, because it is what every typed tag matches on.
 */
export function categoryFromSlug(
  slug: string,
  sortOrder: number,
): Pick<Category, 'slug' | 'name' | 'sort_order'> {
  return { slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), sort_order: sortOrder };
}

/** Notes are null when empty, never an empty string (`Task.notes`). */
export function normaliseNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : null;
}
