/**
 * The slice of the schema the `mcp` function touches, in the shape
 * `supabase gen types typescript` emits (taken from it on 6 Oct, migrations
 * 0001–0007). Hand-trimmed to five relations so a column added elsewhere does
 * not churn this file; regenerate and trim again if one of these changes.
 */
export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' };
  public: {
    Tables: {
      categories: {
        Row: {
          colour: string;
          created_at: string;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          user_id: string;
        };
        Insert: {
          colour?: string;
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
          user_id: string;
        };
        Update: {
          colour?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      day_snapshots: {
        Row: {
          carried_count: number;
          carried_task_ids: string[];
          completed_count: number;
          date: string;
          user_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      tasks: {
        Row: {
          carried_over_count: number;
          category_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_date: string;
          energy: string | null;
          id: string;
          notes: string | null;
          reminder_at: string | null;
          reminder_sent_at: string | null;
          reschedule_count: number;
          scheduled_date: string;
          text: string;
          user_id: string;
        };
        Insert: {
          carried_over_count?: number;
          category_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_date: string;
          energy?: string | null;
          id?: string;
          notes?: string | null;
          reminder_at?: string | null;
          reschedule_count?: number;
          scheduled_date: string;
          text: string;
          user_id: string;
        };
        Update: {
          category_id?: string | null;
          completed_at?: string | null;
          energy?: string | null;
          notes?: string | null;
          reminder_at?: string | null;
          reschedule_count?: number;
          scheduled_date?: string;
          text?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: { timezone: string; user_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      rollover_and_snapshot: {
        Args: { p_today: string };
        Returns: { rolled_count: number; snapshots_written: number }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
