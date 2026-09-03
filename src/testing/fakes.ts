import type {
  Category,
  DaySnapshot,
  Energy,
  PushSubscriptionRow,
  Task,
  UserSettings,
} from '../app/core/models';

/**
 * Row builders for specs.
 *
 * Every field has a default, so a spec names only what it is actually
 * asserting on: `makeTask({ completed_at: null })` reads as "an incomplete
 * task" instead of burying the one relevant field in fifteen irrelevant ones.
 *
 * Dates are literal `YYYY-MM-DD` strings, never derived from `new Date()`.
 * A fixture that moves with the clock is a test that fails one morning in
 * Sydney for reasons no one can reproduce — the same class of bug
 * `core/dates.ts` exists to prevent in the app itself.
 */

export const USER_ID = '00000000-0000-4000-8000-000000000001';
export const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';

/** A fixed "today" for specs that need one. A Tuesday. */
export const TODAY = '2026-08-18';
export const YESTERDAY = '2026-08-17';
export const TOMORROW = '2026-08-19';

let seq = 0;
/** Stable, readable ids — `task-1`, `task-2` — so a failure message says which. */
function nextId(prefix: string): string {
  return `${prefix}-${++seq}`;
}

/** Resets the id counter. Call in `beforeEach` if a spec asserts on exact ids. */
export function resetIds(): void {
  seq = 0;
}

export function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: nextId('task'),
    user_id: USER_ID,
    text: 'call physio',
    created_date: TODAY,
    scheduled_date: TODAY,
    completed_at: null,
    energy: null,
    category_id: null,
    reminder_at: null,
    carried_over_count: 0,
    reschedule_count: 0,
    created_at: `${TODAY}T09:00:00.000Z`,
    ...over,
  };
}

/** A task that is done. `completed_at` is what "done" means — there is no status column. */
export function makeDoneTask(over: Partial<Task> = {}): Task {
  return makeTask({ completed_at: `${TODAY}T20:11:00.000Z`, ...over });
}

/** A task that has rolled over `times` days without being finished. */
export function makeCarriedTask(times: number, over: Partial<Task> = {}): Task {
  return makeTask({ carried_over_count: times, created_date: YESTERDAY, ...over });
}

export function makeCategory(over: Partial<Category> = {}): Category {
  return {
    id: nextId('category'),
    user_id: USER_ID,
    name: 'Home',
    slug: 'home',
    colour: '#6366f1',
    sort_order: 0,
    created_at: `${TODAY}T09:00:00.000Z`,
    ...over,
  };
}

/** The four categories `ensure_user_setup` seeds on first login. */
export function makeDefaultCategories(): Category[] {
  return ['Work', 'Home', 'Health', 'Admin'].map((name, i) =>
    makeCategory({ name, slug: name.toLowerCase(), sort_order: i }),
  );
}

export function makeSnapshot(over: Partial<DaySnapshot> = {}): DaySnapshot {
  return {
    user_id: USER_ID,
    date: YESTERDAY,
    completed_count: 0,
    carried_count: 0,
    carried_task_ids: [],
    ...over,
  };
}

export function makeSettings(over: Partial<UserSettings> = {}): UserSettings {
  return {
    user_id: USER_ID,
    timezone: 'Australia/Sydney',
    digest_enabled: false,
    digest_send_at: '07:00',
    seeded_at: `${TODAY}T09:00:00.000Z`,
    ...over,
  };
}

export function makePushSubscription(over: Partial<PushSubscriptionRow> = {}): PushSubscriptionRow {
  return {
    id: nextId('push'),
    user_id: USER_ID,
    endpoint: 'https://push.example.test/abc',
    p256dh: 'p256dh-key',
    auth: 'auth-key',
    created_at: `${TODAY}T09:00:00.000Z`,
    last_sent_at: null,
    ...over,
  };
}

export const ENERGIES: Energy[] = ['quick', 'deep'];
