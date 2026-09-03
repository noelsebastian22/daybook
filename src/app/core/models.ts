export type Energy = 'quick' | 'deep';

export interface Category {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  colour: string;
  sort_order: number;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  text: string;
  /** When it was first written down. Immutable. */
  created_date: string;
  /** Which day it lives on. Mutable, may be in the future. */
  scheduled_date: string;
  /** null means not done. */
  completed_at: string | null;
  energy: Energy | null;
  category_id: string | null;
  reminder_at: string | null;
  /** Automatic rollovers only. */
  carried_over_count: number;
  /** Manual pushes only. */
  reschedule_count: number;
  created_at: string;
}

export interface DaySnapshot {
  user_id: string;
  date: string;
  completed_count: number;
  carried_count: number;
  carried_task_ids: string[];
}

export interface UserSettings {
  user_id: string;
  timezone: string;
  digest_enabled: boolean;
  digest_send_at: string;
  seeded_at: string | null;
  /**
   * @deprecated Superseded by `push_subscriptions`. A subscription belongs to
   * a browser install, not to a user, so holding one per user meant two
   * accounts on one device wrote the same endpoint into two rows and the cron
   * pushed user A's task text to a device user B was signed in on. Still on
   * the table as the rollback path; dropped in migration 0006. Nothing reads
   * it.
   */
  push_subscription?: unknown | null;
}

/**
 * One push endpoint — one browser install. Unique on `endpoint` globally and
 * deliberately not per user: an install has exactly one current owner, so a
 * device changing hands must move the row rather than add a second one.
 */
export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
  last_sent_at: string | null;
}

/**
 * A day, and optionally a time, chosen explicitly through the date picker.
 * Overrides whatever the capture text parsed to.
 */
export interface Scheduling {
  scheduled_date: string;
  reminder_at: string | null;
}

export interface TaskDraft {
  text: string;
  scheduled_date: string;
  energy: Energy | null;
  category_id: string | null;
  reminder_at: string | null;
}
