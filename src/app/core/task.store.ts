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
import { isOffline, OfflineQueue } from './offline-queue';
import { parseCapture } from './parse-capture';
import { addDays, sentenceDate, today } from './dates';
import type { Category, DaySnapshot, Energy, Scheduling, Task } from './models';

export type EnergyFilter = 'all' | Energy;

interface TaskState {
  tasks: Task[];
  categories: Category[];
  loading: boolean;
  loaded: boolean;
  filter: EnergyFilter;
  /** Category id, or null for every category. Independent of the energy filter. */
  categoryFilter: string | null;
  upcomingOpen: boolean;
  lastRolledCount: number;
  /** One row per day the app was open. The calendar's past half reads these. */
  snapshots: DaySnapshot[];
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
    categoryFilter: null,
    upcomingOpen: false,
    lastRolledCount: 0,
    snapshots: [],
  }),

  withComputed((store) => {
    const todaysTasks = computed(() =>
      store
        .tasks()
        .filter((t) => t.scheduled_date === today())
        .sort(sortForDay),
    );

    /**
     * Energy and category filter together, as an AND. They answer different
     * questions — "how much focus have I got" and "which part of my life" —
     * so making them exclusive would force a pointless choice between them.
     */
    const visibleTasks = computed(() => {
      const energy = store.filter();
      const category = store.categoryFilter();
      return todaysTasks().filter(
        (t) =>
          (energy === 'all' || t.energy === energy) &&
          (category === null || t.category_id === category),
      );
    });

    return {
      todaysTasks,
      visibleTasks,

      /** True when anything is hidden, so the empty state can say why. */
      filtered: computed(() => store.filter() !== 'all' || store.categoryFilter() !== null),

      /**
       * The two halves of `visibleTasks`, because they answer different
       * questions: what is left, and what today already amounted to.
       *
       * Splitting them is what makes the `clear` empty state reachable at all.
       * While completed rows stayed in the one list, an empty list could only
       * ever mean an empty day, so "All clear for today." could not render and
       * "Write the first thing down." took its place on a finished day.
       */
      openTasks: computed(() => visibleTasks().filter((t) => !t.completed_at)),
      doneTasks: computed(() => visibleTasks().filter((t) => t.completed_at)),

      /** Only categories with something on today; an empty chip filters to nothing. */
      todaysCategories: computed(() => {
        const present = new Set(
          todaysTasks()
            .map((t) => t.category_id)
            .filter((id): id is string => id !== null),
        );
        return store.categories().filter((c) => present.has(c.id));
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

      /** For the /today/:id card, which is handed an id by the router. */
      taskById: computed(() => new Map(store.tasks().map((t) => [t.id, t]))),

      snapshotByDate: computed(() => new Map(store.snapshots().map((s) => [s.date, s]))),

      /** Scheduled, still-open task count per day. The calendar's future half. */
      openCountByDate: computed(() => {
        const counts = new Map<string, number>();
        for (const t of store.tasks()) {
          if (t.completed_at) continue;
          counts.set(t.scheduled_date, (counts.get(t.scheduled_date) ?? 0) + 1);
        }
        return counts;
      }),
    };
  }),

  withMethods(
    (
      store,
      sb = inject(Supabase),
      session = inject(SessionStore),
      toast = inject(ToastStore),
      queue = inject(OfflineQueue),
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
        // Anything still queued is layered back over the server's answer, or
        // opening the app offline would look like the last session's writes
        // never happened.
        patchState(store, { tasks: queue.applyTo((data ?? []) as Task[]) });
      }

      /** Merges by id, so a range load never drops what another view is showing. */
      function mergeTasks(incoming: Task[]): void {
        const byId = new Map(store.tasks().map((t) => [t.id, t]));
        for (const t of incoming) byId.set(t.id, t);
        patchState(store, { tasks: [...byId.values()] });
      }

      /**
       * An arbitrary window, for the calendar paging outside the month that
       * `loadTasks` covers. Merges rather than replaces.
       */
      async function loadRange(from: string, to: string): Promise<void> {
        const { data, error } = await sb.client
          .from('tasks')
          .select('*')
          .gte('scheduled_date', from)
          .lte('scheduled_date', to)
          .order('created_at');
        if (error) {
          toast.error('Could not load those days.');
          return;
        }
        mergeTasks((data ?? []) as Task[]);
      }

      /**
       * Day snapshots for the calendar's past half. One row exists per day the
       * app was opened; a missing row is a day it was not, which the calendar
       * has to render differently from a day with nothing done.
       */
      async function loadSnapshots(from: string, to: string): Promise<void> {
        const { data, error } = await sb.client
          .from('day_snapshots')
          .select('*')
          .gte('date', from)
          .lte('date', to)
          .order('date');
        if (error) {
          toast.error('Could not load your history.');
          return;
        }
        const byDate = new Map(store.snapshots().map((s) => [s.date, s]));
        for (const s of (data ?? []) as DaySnapshot[]) byDate.set(s.date, s);
        patchState(store, {
          snapshots: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
        });
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
          // A failure here is not cosmetic: yesterday's unfinished work stays
          // on yesterday, so Today looks emptier than it is and the user has
          // no way to tell that from having actually finished. It used to
          // return in silence.
          //
          // Offline is the exception, and the usual one — rollover runs on
          // every open, including the ones with no connection. It is retried
          // on the next open, so there is nothing to report and nothing the
          // user could do about it.
          if (!isOffline(error)) toast.error('Could not carry unfinished tasks over.');
          return;
        }
        const rolled = Array.isArray(data) ? (data[0]?.rolled_count ?? 0) : 0;
        patchState(store, { lastRolledCount: rolled });
        if (rolled > 0) {
          toast.show(`${rolled} task${rolled === 1 ? '' : 's'} carried over from before today.`);
        }
      }

      async function removeTask(task: Task): Promise<void> {
        removeLocal(task.id);
        const { error } = await sb.client.from('tasks').delete().eq('id', task.id);
        if (!error) return;
        if (isOffline(error)) {
          queue.enqueue({ op: 'delete', id: task.id });
          return;
        }
        patchState(store, { tasks: [...store.tasks(), task] });
        toast.error('Could not delete that task.');
      }

      /**
       * Puts a deleted task back under its original id, so an Undo restores
       * the row rather than making a copy of it. Everything but the row's own
       * columns is already in hand, so this is an insert, not an upsert.
       */
      async function restoreTask(task: Task): Promise<void> {
        patchState(store, { tasks: [...store.tasks(), task] });
        const { error } = await sb.client.from('tasks').insert(task);
        if (!error) return;
        if (isOffline(error)) {
          queue.enqueue({ op: 'insert', row: task });
          return;
        }
        removeLocal(task.id);
        toast.error('Could not bring that task back.');
      }

      /**
       * Delete with an Undo, the only route to `remove` that a person can
       * reach. There is no confirmation dialog anywhere in this app.
       */
      async function removeWithUndo(task: Task): Promise<void> {
        await removeTask(task);
        toast.show('Deleted.', () => void restoreTask(task));
      }

      /**
       * Optimistic field update. Rolls back to `before` on failure, which is
       * captured from the task the caller already holds rather than re-read.
       */
      async function update(task: Task, patch: Partial<Task>): Promise<boolean> {
        const before: Partial<Task> = {};
        for (const key of Object.keys(patch) as Array<keyof Task>) {
          Object.assign(before, { [key]: task[key] });
        }

        replace(task.id, patch);

        const { error } = await sb.client.from('tasks').update(patch).eq('id', task.id);
        if (!error) return true;
        if (isOffline(error)) {
          // The local patch stands. It is replayed when the connection is.
          queue.enqueue({ op: 'update', id: task.id, patch });
          return true;
        }
        replace(task.id, before);
        toast.error('Could not save that change.');
        return false;
      }

      /** Rename or recolour, from Settings. The slug is left alone — it is what
       *  `#tag` matches on, and changing it would orphan every tag already typed. */
      async function updateCategory(
        category: Category,
        patch: Partial<Category>,
      ): Promise<void> {
        const before = store.categories();
        patchState(store, {
          categories: before.map((c) => (c.id === category.id ? { ...c, ...patch } : c)),
        });

        const { error } = await sb.client
          .from('categories')
          .update(patch)
          .eq('id', category.id);
        if (error) {
          patchState(store, { categories: before });
          toast.error('Could not save that category.');
        }
      }

      /**
       * Deleting a category does not delete its tasks — the FK is
       * `on delete set null`, so they survive untagged. The local tasks have
       * to be untagged too or they keep pointing at a category that is gone
       * and render a blank chip.
       */
      async function removeCategory(category: Category): Promise<void> {
        const categoriesBefore = store.categories();
        const tasksBefore = store.tasks();

        patchState(store, {
          categories: categoriesBefore.filter((c) => c.id !== category.id),
          tasks: tasksBefore.map((t) =>
            t.category_id === category.id ? { ...t, category_id: null } : t,
          ),
          categoryFilter: store.categoryFilter() === category.id ? null : store.categoryFilter(),
        });

        const { error } = await sb.client.from('categories').delete().eq('id', category.id);
        if (error) {
          patchState(store, { categories: categoriesBefore, tasks: tasksBefore });
          toast.error('Could not delete that category.');
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

      async function init(): Promise<void> {
        // Queued writes go first. Rollover reads the tasks table to decide
        // what to carry, so a task completed offline yesterday has to land
        // before it runs or it gets carried forward as though it were open.
        await queue.flush();
        await rollover();
        await Promise.all([loadCategories(), loadTasks()]);
      }

      /**
       * Idempotent open. Every page calls it, because any of them can be the
       * first one mounted — a deep link to /today/:id or /calendar lands
       * without Today ever having run. Rollover is idempotent server-side, so
       * the guard here is about not firing four redundant selects, not about
       * correctness.
       */
      async function ensureLoaded(): Promise<void> {
        if (store.loaded() || store.loading()) return;
        await init();
      }

      return {
        setFilter: (filter: EnergyFilter) => patchState(store, { filter }),
        setCategoryFilter: (categoryFilter: string | null) =>
          patchState(store, { categoryFilter }),
        clearFilters: () => patchState(store, { filter: 'all', categoryFilter: null }),
        toggleUpcoming: () => patchState(store, { upcomingOpen: !store.upcomingOpen() }),

        init,
        ensureLoaded,
        loadTasks,
        loadCategories,
        loadRange,
        loadSnapshots,
        rollover,

        /**
         * Optimistic: the row lands in the list before the network call.
         * On failure it is pulled back out and the input is handed back to
         * the caller so nothing typed is lost.
         *
         * The toast is the only proof the add worked. A task scheduled for a
         * future day goes straight into the collapsed Upcoming strip and is
         * never seen, so it names the day it landed on. It fires before the
         * insert resolves, for the same reason the row does — feedback does
         * not wait on a round trip.
         */
        async addFromCapture(
          input: string,
          scheduling: Scheduling | null = null,
        ): Promise<boolean> {
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
            // The picker wins over the text when it was used, and it carries
            // the reminder with it, so a picked day is never paired with a
            // time left behind on the day that was typed.
            scheduled_date: scheduling?.scheduled_date ?? parsed.scheduled_date,
            completed_at: null,
            energy: parsed.energy,
            category_id,
            reminder_at: scheduling ? scheduling.reminder_at : parsed.reminder_at,
            carried_over_count: 0,
            reschedule_count: 0,
            created_at: new Date().toISOString(),
          };
          patchState(store, { tasks: [...store.tasks(), optimistic] });

          // Undo may be pressed while the insert is still in flight, when
          // there is no server row to delete yet. Drop it locally now and let
          // the insert clean up after itself below.
          let saved: Task | null = null;
          let undone = false;
          const toastId = toast.show(
            `Added to ${sentenceDate(optimistic.scheduled_date)}.`,
            () => {
              undone = true;
              if (saved) void removeTask(saved);
              else removeLocal(tempId);
            },
          );

          // The client id goes to the server rather than being stripped. It
          // makes the optimistic row and the stored row the same row, which is
          // what lets an offline edit of an offline-created task queue up
          // against an id that will still be valid when both are replayed.
          const { data, error } = await sb.client.from('tasks').insert(optimistic).select().single();

          if (error || !data) {
            if (error && isOffline(error)) {
              // Keep the row on screen and post it when there is a connection.
              // Undo already took it off screen, and nothing was ever sent, so
              // there is nothing to queue in that case.
              if (!undone) queue.enqueue({ op: 'insert', row: optimistic });
              return !undone;
            }
            toast.dismiss(toastId);
            removeLocal(tempId);
            toast.error('Could not save that task.');
            return false;
          }

          if (undone) {
            // The row is already gone from the list; only the server copy is
            // left, and removeTask puts it back if the delete fails.
            await removeTask(data as Task);
            return false;
          }

          saved = data as Task;
          replace(tempId, saved);
          return true;
        },

        /**
         * The edit card's commit. Same parser as capture, so `#tag` and
         * `!energy` behave identically in both places — the edit box is seeded
         * with the tokens spelled back out for exactly that reason.
         *
         * Pushing the day later here counts as a manual reschedule, the same
         * as the row's arrow button. Pulling it *earlier* does not: dragging
         * work forward is not avoidance, and counting it would poison the
         * "what do I keep avoiding" number that §5 feature 10 exists to
         * answer.
         */
        async editFromCapture(
          task: Task,
          input: string,
          scheduling: Scheduling | null = null,
        ): Promise<boolean> {
          const parsed = parseCapture(input);
          if (!parsed.text) {
            toast.error('That is all tags and no task.');
            return false;
          }

          const category_id = await resolveCategory(parsed.categorySlug);
          const scheduled_date = scheduling?.scheduled_date ?? parsed.scheduled_date;

          const patch: Partial<Task> = {
            text: parsed.text,
            energy: parsed.energy,
            category_id,
            scheduled_date,
            reminder_at: scheduling ? scheduling.reminder_at : parsed.reminder_at,
          };

          if (scheduled_date > task.scheduled_date) {
            patch.reschedule_count = task.reschedule_count + 1;
          }

          return update(task, patch);
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

          if (!(await update(task, patch))) return;

          if (!wasComplete) {
            toast.show('Done.', () => void this.toggleComplete({ ...task, ...patch }));
          }
        },

        /** Manual push. Increments reschedule_count, never carried_over_count. */
        async reschedule(task: Task, date: string): Promise<void> {
          const from = task.scheduled_date;
          const patch = {
            scheduled_date: date,
            reschedule_count: task.reschedule_count + 1,
          };

          if (!(await update(task, patch))) return;

          // Undoing a push counts as another one. That is deliberate: the
          // count measures how much a task has been shoved about, and shoving
          // it back is more of that, not less.
          toast.show('Moved.', () => void this.reschedule({ ...task, ...patch }, from));
        },

        update,
        remove: removeTask,
        removeWithUndo,
        updateCategory,
        removeCategory,
      };
    },
  ),
);
