/**
 * Tuning values for `task.store.ts`.
 *
 * They live here rather than beside their call sites so that changing what the
 * app considers "soon" or "loaded" is one decision in one place, and so the
 * reasoning below survives the next person who wonders why the numbers are
 * what they are.
 */

/**
 * How far ahead the Upcoming strip looks, in days.
 *
 * A week, because that is the horizon a person can actually plan against —
 * far enough that Friday is visible on a Monday, close enough that the strip
 * stays a glance rather than a second task list.
 */
export const UPCOMING_DAYS = 7;

/**
 * The window `TaskStore.loadTasks` fetches, relative to today.
 *
 * A fortnight back for history context, a month ahead for scheduling. The
 * full history view loads its own range in Phase 4, and the calendar pages
 * outside this window through `loadRange`, which merges rather than replaces.
 */
export const LOAD_WINDOW_BACK_DAYS = -14;
export const LOAD_WINDOW_FORWARD_DAYS = 30;

/**
 * The least time between two refreshes on the tab coming back into view.
 * Switching from Claude to Daybook and back a few times in a minute should
 * not be a fetch each time; coming back after a real absence should be.
 */
export const REFRESH_MIN_GAP_MS = 15_000;
