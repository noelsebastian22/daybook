import { computed, inject } from '@angular/core';
import {
  signalStore,
  withState,
  withComputed,
  withMethods,
  patchState,
} from '@ngrx/signals';
import { Supabase } from './supabase';
import { SessionStore } from './session.store';
import { ToastStore } from './toast.store';
import { parseCapture } from './parse-capture';
import { addDays, today } from './dates';
import type { Category, Energy, Task } from './models';

export type EnergyFilter = 'all' | Energy;

interface TaskState {
  tasks: Task[];
  categories: Category[];
  loading: boolean;
  loaded: boolean;
  filter: EnergyFilter;
  upcomingOpen: boolean;
  lastRolledCount: number;
}

const UPCOMING_DAYS = 7;

/** Open tasks first, then completed, newest completion last. */
function sortForDay(a: Task, b: Task): number {
  if (!a.completed_at && b.completed_at) return -1;
  if (a.completed_at && !b.completed_at) return 1;
  if (a.completed_at && b.completed_at) return a.completed_at.localeCompare(b.completed_at);
  return a.created_at.localeCompare(b.created_at);
}

export const TaskStore = signalStore(
  { providedIn: 'root' },
  withState<TaskState>({
    tasks: [],
    categories: [],
    loading: false,
    loaded: false,
    filter: 'all',
    upcomingOpen: false,
    lastRolledCount: 0,
  }),

  withComputed((store) => {
    const todaysTasks = computed(() =>
      store
        .tasks()
        .filter((t) => t.scheduled_date === today())
        .sort(sortForDay),
    );

    return {
      todaysTasks,

      visibleTasks: computed(() => {
        const f = store.filter();
        const list = todaysTasks();
        return f === 'all' ? list : list.filter((t) => t.energy === f);
      }),

      openCount: computed(() => todaysTasks().filter((t) => !t.completed_at).length),
      completedCount: computed(() => todaysTasks().filter((t) => t.completed_at).length),

      /** Next 7 days, only days that actually have something on them. */
      upcoming: computed(() => {
        const start = addDays(today(), 1);
        const end = addDays(today(), UPCOMING_DAYS);
        const byDay = new Map<string, Task[]>();
        for (const t of store.tasks()) {
          if (t.completed_at) continue;
          if (t.scheduled_date < start || t.scheduled_date > end) continue;
          const bucket = byDay.get(t.scheduled_date) ?? [];
          bucket.push(t);
          byDay.set(t.scheduled_date, bucket);
        }
        return [...byDay.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, tasks]) => ({ date, tasks }));
      }),

      upcomingCount: computed(() => {
        const start = addDays(today(), 1);
        const end = addDays(today(), UPCOMING_DAYS);
        return store
          .tasks()
          .filter((t) => !t.completed_at && t.scheduled_date >= start && t.scheduled_date <= end)
          .length;
      }),

      categoryById: computed(() => new Map(store.categories().map((c) => [c.id, c]))),
    };
  }),

  withMethods(
    (
      store,
      sb = inject(Supabase),
      session = inject(SessionStore),
      toast = inject(ToastStore),
    ) => {
      const replace = (id: string, patch: Partial<Task>) =>
        patchState(store, {
          tasks: store.tasks().map((t) => (t.id === id ? { ...t, ...patch } : t)),
        });

      const removeLocal = (id: string) =>
        patchState(store, { tasks: store.tasks().filter((t) => t.id !== id) });

      async function loadCategories(): Promise<void> {
        const { data, error } = await sb.client
          .from('categories')
          .select('*')
          .order('sort_order');
        if (error) {
          toast.error('Could not load categories.');
          return;
        }
        patchState(store, { categories: (data ?? []) as Category[] });
      }

      /**
       * Window: a fortnight back for history context, a month ahead for
       * scheduling. The full history view loads its own range in Phase 4.
       */
      async function loadTasks(): Promise<void> {
        patchState(store, { loading: true });
        const { data, error } = await sb.client
          .from('tasks')
          .select('*')
          .gte('scheduled_date', addDays(today(), -14))
          .lte('scheduled_date', addDays(today(), 30))
          .order('created_at');
        patchState(store, { loading: false, loaded: true });
        if (error) {
          toast.error('Could not load tasks.');
          return;
        }
        patchState(store, { tasks: (data ?? []) as Task[] });
      }

      /**
       * Lazy rollover, run once per app open with the client's local date.
       * Server clamps it and writes the day_snapshots rows for every day in
       * the gap. Idempotent, so a double call costs nothing.
       */
      async function rollover(): Promise<void> {
        const { data, error } = await sb.client.rpc('rollover_and_snapshot', {
          p_today: today(),
        });
        if (error) {
          console.error('rollover failed', error);
          return;
        }
        const rolled = Array.isArray(data) ? (data[0]?.rolled_count ?? 0) : 0;
        patchState(store, { lastRolledCount: rolled });
        if (rolled > 0) {
          toast.show(`${rolled} task${rolled === 1 ? '' : 's'} carried over from before today.`);
        }
      }

      /** Unknown #slug creates the category rather than dropping the tag. */
      async function resolveCategory(slug: string | null): Promise<string | null> {
        if (!slug) return null;
        const existing = store.categories().find((c) => c.slug === slug);
        if (existing) return existing.id;

        const uid = session.userId();
        if (!uid) return null;

        const { data, error } = await sb.client
          .from('categories')
          .insert({
            user_id: uid,
            slug,
            name: slug.charAt(0).toUpperCase() + slug.slice(1),
            sort_order: store.categories().length,
          })
          .select()
          .single();

        if (error || !data) return null;
        patchState(store, { categories: [...store.categories(), data as Category] });
        return (data as Category).id;
      }

      return {
        setFilter: (filter: EnergyFilter) => patchState(store, { filter }),
        toggleUpcoming: () => patchState(store, { upcomingOpen: !store.upcomingOpen() }),

        async init(): Promise<void> {
          await rollover();
          await Promise.all([loadCategories(), loadTasks()]);
        },

        loadTasks,
        loadCategories,
        rollover,

        /**
         * Optimistic: the row lands in the list before the network call.
         * On failure it is pulled back out and the input is handed back to
         * the caller so nothing typed is lost.
         */
        async addFromCapture(input: string): Promise<boolean> {
          const uid = session.userId();
          if (!uid || !input.trim()) return false;

          const parsed = parseCapture(input);
          if (!parsed.text) {
            toast.error('That is all tags and no task.');
            return false;
          }

          const category_id = await resolveCategory(parsed.categorySlug);
          const tempId = crypto.randomUUID();
          const optimistic: Task = {
            id: tempId,
            user_id: uid,
            text: parsed.text,
            created_date: today(),
            scheduled_date: parsed.scheduled_date,
            completed_at: null,
            energy: parsed.energy,
            category_id,
            reminder_at: parsed.reminder_at,
            carried_over_count: 0,
            reschedule_count: 0,
            created_at: new Date().toISOString(),
          };
          patchState(store, { tasks: [...store.tasks(), optimistic] });

          const { id: _drop, ...insert } = optimistic;
          const { data, error } = await sb.client.from('tasks').insert(insert).select().single();

          if (error || !data) {
            removeLocal(tempId);
            toast.error('Could not save that task.');
            return false;
          }
          replace(tempId, data as Task);
          return true;
        },

        /**
         * Completing also pins scheduled_date to today, otherwise a task
         * scheduled for Friday and finished on Wednesday never shows up in
         * Wednesday's log.
         */
        async toggleComplete(task: Task): Promise<void> {
          const wasComplete = !!task.completed_at;
          const patch: Partial<Task> = wasComplete
            ? { completed_at: null }
            : { completed_at: new Date().toISOString(), scheduled_date: today() };
          const before = { completed_at: task.completed_at, scheduled_date: task.scheduled_date };

          replace(task.id, patch);

          const { error } = await sb.client.from('tasks').update(patch).eq('id', task.id);
          if (error) {
            replace(task.id, before);
            toast.error('Could not update that task.');
            return;
          }

          if (!wasComplete) {
            toast.show('Done.', () => void this.toggleComplete({ ...task, ...patch }));
          }
        },

        /** Manual push. Increments reschedule_count, never carried_over_count. */
        async reschedule(task: Task, date: string): Promise<void> {
          const before = {
            scheduled_date: task.scheduled_date,
            reschedule_count: task.reschedule_count,
          };
          const patch = {
            scheduled_date: date,
            reschedule_count: task.reschedule_count + 1,
          };
          replace(task.id, patch);

          const { error } = await sb.client.from('tasks').update(patch).eq('id', task.id);
          if (error) {
            replace(task.id, before);
            toast.error('Could not reschedule that task.');
            return;
          }
          toast.show('Moved.', () => void this.reschedule({ ...task, ...patch }, before.scheduled_date));
        },

        async remove(task: Task): Promise<void> {
          removeLocal(task.id);
          const { error } = await sb.client.from('tasks').delete().eq('id', task.id);
          if (error) {
            patchState(store, { tasks: [...store.tasks(), task] });
            toast.error('Could not delete that task.');
          }
        },
      };
    },
  ),
);
