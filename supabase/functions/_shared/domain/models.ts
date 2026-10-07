/**
 * Row shapes shared by the app and the Edge Functions. `src/app/core/models.ts`
 * re-exports these, so app code keeps importing from there.
 */

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
  /** Standing detail. Null means none — never an empty string. */
  notes: string | null;
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

/**
 * A day, and optionally a time, chosen explicitly through the date picker.
 * Overrides whatever the capture text parsed to.
 */
export interface Scheduling {
  scheduled_date: string;
  reminder_at: string | null;
}
