import type { Energy } from '../../../supabase/functions/_shared/domain/models.ts';

// The row shapes the Edge Functions share live in the domain module, so the
// app and the `mcp` function cannot drift apart on what a task is.
export type {
  Category,
  DaySnapshot,
  Energy,
  Task,
} from '../../../supabase/functions/_shared/domain/models.ts';

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
   * the table as the rollback path; dropped in a later migration — 0006 went
   * to task notes. Nothing reads it.
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

export type { Scheduling } from '../../../supabase/functions/_shared/domain/models.ts';

export interface TaskDraft {
  text: string;
  scheduled_date: string;
  energy: Energy | null;
  category_id: string | null;
  reminder_at: string | null;
}

/**
 * What the access Edge Function says about an address it was given.
 * `created` means a row was just written; the rest are the status of a row
 * that already existed.
 */
export type AccessOutcome = 'created' | 'pending' | 'approved' | 'denied';

/**
 * A decision link that cannot decide: `expired` past its 30 days, `invalid`
 * for never issued or already used — the function will not say which.
 */
export type DeadToken = { state: 'expired' | 'invalid' };

/** What `/access/decide` shows before anything is pressed. */
export type AccessLookup = { state: 'pending'; email: string; note: string | null } | DeadToken;

/** What pressing Approve or Deny did. */
export type AccessDecision = { state: 'approved' | 'denied'; email: string } | DeadToken;
