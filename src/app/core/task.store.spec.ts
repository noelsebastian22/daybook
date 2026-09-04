import { TestBed } from '@angular/core/testing';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeSupabase, fail, ok, type RecordedCall } from '../../testing/fake-supabase';
import {
  makeCategory,
  makeDefaultCategories,
  makeSnapshot,
  makeTask,
  OTHER_USER_ID,
  resetIds,
  TODAY,
  TOMORROW,
  USER_ID,
  YESTERDAY,
} from '../../testing/fakes';
import type { Task } from './models';
import { OfflineQueue } from './offline-queue';
import { Push } from './push';
import { SessionStore } from './session.store';
import { Supabase } from './supabase';
import { TaskStore } from './task.store';
import { ToastStore } from './toast.store';

/**
 * The clock is pinned for every test in this file.
 *
 * `today()` reads the wall clock, and most of what this store does is decided
 * against it — which day a row lands on, which rows Today shows, what window
 * is fetched, what `rollover` tells the server. A spec that lets the real date
 * through cannot assert any of that, and worse, it passes or fails depending
 * on which day it is run. TODAY in `fakes.ts` is 2026-08-18, a Tuesday, and
 * this is the same instant.
 */
const NOW = new Date(2026, 7, 18, 9, 0, 0);

/**
 * `Push` injects `SwPush`, which is only provided by `provideServiceWorker()`
 * and is therefore absent in a spec. `SessionStore` injects `Push`, so every
 * test that touches this store needs a stand-in or the injector throws before
 * a single assertion runs.
 */
class FakePush {
  blocker(): null {
    return null;
  }
  async subscribe(): Promise<null> {
    return null;
  }
  async unsubscribe(): Promise<void> {}
  async currentEndpoint(): Promise<string | null> {
    return null;
  }
}

function sessionFor(id: string): Session {
  return { user: { id } } as unknown as Session;
}

/** Lets every already-queued promise callback run. No timers involved. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('TaskStore', () => {
  let db: FakeSupabase;
  let store: InstanceType<typeof TaskStore>;
  let session: InstanceType<typeof SessionStore>;
  let toast: InstanceType<typeof ToastStore>;
  let queue: OfflineQueue;

  /** Every `from(table)` call made so far, oldest first. */
  const callsTo = (table: string): RecordedCall[] =>
    db.calls.filter((c) => c.kind === 'from' && c.name === table);

  /** The arguments of every `op` sent to `table`, across all calls. */
  const argsFor = (table: string, op: string): unknown[][] =>
    callsTo(table).flatMap((c) => c.chain.filter((s) => s.op === op).map((s) => s.args));

  const lastRpc = (fn: string): unknown =>
    [...db.calls].reverse().find((c) => c.kind === 'rpc' && c.name === fn)?.chain[0]?.args[0];

  const errorToasts = (): string[] =>
    toast
      .toasts()
      .filter((t) => t.tone === 'error')
      .map((t) => t.message);

  const messages = (): string[] => toast.toasts().map((t) => t.message);

  /** Puts rows in the store the way a real load would, then clears the log. */
  async function seed(tasks: Task[]): Promise<void> {
    db.onFrom('tasks', ok(tasks));
    await store.loadTasks();
    db.calls.length = 0;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resetIds();
    localStorage.clear();
    // Rollover failures are reported through console.error by design; the
    // assertions are on the toast, and the log is only noise in the runner.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    TestBed.configureTestingModule({ providers: [{ provide: Push, useClass: FakePush }] });

    db = TestBed.inject(Supabase) as unknown as FakeSupabase;
    session = TestBed.inject(SessionStore);
    // The store's onInit fires getSession(); let it land before overriding it,
    // or it resolves later and wipes the session this spec just set.
    await settle();
    session.apply(sessionFor(USER_ID));

    store = TestBed.inject(TaskStore);
    toast = TestBed.inject(ToastStore);
    queue = TestBed.inject(OfflineQueue);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('loading', () => {
    it('fills the store from one open', async () => {
      db.onFrom('tasks', ok([makeTask()]));
      db.onFrom('categories', ok(makeDefaultCategories()));
      db.onRpc('rollover_and_snapshot', ok([{ rolled_count: 0 }]));

      await store.ensureLoaded();

      expect(store.tasks()).toHaveLength(1);
      expect(store.categories()).toHaveLength(4);
      expect(store.loaded()).toBe(true);
      expect(store.loading()).toBe(false);
    });

    it('fetches a fortnight back and a month ahead of the local today', async () => {
      db.onFrom('tasks', ok([]));

      await store.loadTasks();

      expect(argsFor('tasks', 'gte')).toEqual([['scheduled_date', '2026-08-04']]);
      expect(argsFor('tasks', 'lte')).toEqual([['scheduled_date', '2026-09-17']]);
    });

    it('populates on a retry after a load that failed', async () => {
      // The bug this locks in: a failed load used to latch `loaded: true`, and
      // `ensureLoaded` returns early on that flag — so opening the app with no
      // connection left an empty list that no later navigation could repair.
      db.onFrom('tasks', fail('boom'));
      await store.ensureLoaded();

      expect(store.loaded()).toBe(false);
      expect(store.tasks()).toEqual([]);
      expect(errorToasts()).toContain('Could not load tasks.');

      db.onFrom('tasks', ok([makeTask()]));
      await store.ensureLoaded();

      expect(store.tasks()).toHaveLength(1);
    });

    it('does not refetch for the user it already holds', async () => {
      db.onFrom('tasks', ok([makeTask()]));
      await store.ensureLoaded();
      const first = callsTo('tasks').length;

      await store.ensureLoaded();

      expect(callsTo('tasks').length).toBe(first);
    });

    it('refetches when a second user signs in on the same page load', async () => {
      db.onFrom('tasks', ok([makeTask()]));
      await store.ensureLoaded();
      db.calls.length = 0;

      session.apply(sessionFor(OTHER_USER_ID));
      await store.ensureLoaded();

      expect(callsTo('tasks').length).toBeGreaterThan(0);
      expect(store.loadedFor()).toBe(OTHER_USER_ID);
    });

    it('drops the previous user rows before the refetch, not after it', async () => {
      // Asserted through a refetch that fails: if the clear happened after the
      // load it would never run here, and the outgoing user's tasks would sit
      // on screen under the incoming user's session.
      db.onFrom('tasks', ok([makeTask({ text: 'their private task' })]));
      await store.ensureLoaded();
      store.setFilter('deep');

      session.apply(sessionFor(OTHER_USER_ID));
      db.onFrom('tasks', fail('boom'));
      await store.ensureLoaded();

      expect(store.tasks()).toEqual([]);
      expect(store.filter()).toBe('all');
    });

    it('layers still-queued writes back over the server answer', async () => {
      // Opening offline otherwise looks like the last session's writes never
      // happened. `loadTasks` is called directly so the queue is not flushed
      // out from under the assertion first.
      const offlineRow = makeTask({ id: 'written-offline', text: 'queued' });
      localStorage.setItem(
        `daybook.queue.v1.${USER_ID}`,
        JSON.stringify([{ op: 'insert', row: offlineRow }]),
      );
      db.onFrom('tasks', ok([makeTask({ id: 'from-server' })]));

      await store.loadTasks();

      expect(
        store
          .tasks()
          .map((t) => t.id)
          .sort(),
      ).toEqual(['from-server', 'written-offline']);
    });

    it('merges a range load instead of replacing what is on screen', async () => {
      await seed([makeTask({ id: 'held', scheduled_date: TODAY })]);
      db.onFrom('tasks', ok([makeTask({ id: 'paged-in', scheduled_date: '2026-10-02' })]));

      await store.loadRange('2026-10-01', '2026-10-31');

      expect(
        store
          .tasks()
          .map((t) => t.id)
          .sort(),
      ).toEqual(['held', 'paged-in']);
    });

    it('toasts and keeps what it had when a range load fails', async () => {
      await seed([makeTask({ id: 'held' })]);
      db.onFrom('tasks', fail('boom'));

      await store.loadRange('2026-10-01', '2026-10-31');

      expect(store.tasks().map((t) => t.id)).toEqual(['held']);
      expect(errorToasts()).toContain('Could not load those days.');
    });

    it('keeps snapshots in date order as more days are read', async () => {
      db.onFrom('day_snapshots', ok([makeSnapshot({ date: '2026-08-12' })]));
      await store.loadSnapshots('2026-08-01', '2026-08-31');
      db.onFrom('day_snapshots', ok([makeSnapshot({ date: '2026-08-10' })]));

      await store.loadSnapshots('2026-08-01', '2026-08-31');

      expect(store.snapshots().map((s) => s.date)).toEqual(['2026-08-10', '2026-08-12']);
    });

    it('toasts when categories cannot be read', async () => {
      db.onFrom('categories', fail('boom'));

      await store.loadCategories();

      expect(errorToasts()).toContain('Could not load categories.');
    });
  });

  describe('rollover', () => {
    it('sends the local calendar date, never the UTC one', () => {
      // AGENTS.md: toISOString() converts to UTC first, which east of
      // Greenwich reports yesterday all morning and west of it reports
      // tomorrow all evening. Both ends of the day are checked so the
      // assertion catches the mistake whichever side of UTC this runs in.
      return (async () => {
        for (const instant of [new Date(2026, 7, 18, 0, 30), new Date(2026, 7, 18, 23, 30)]) {
          vi.setSystemTime(instant);
          await store.rollover();
          expect(lastRpc('rollover_and_snapshot')).toEqual({ p_today: '2026-08-18' });
        }
      })();
    });

    it('says how many tasks were carried, and says it in the singular for one', async () => {
      db.onRpc('rollover_and_snapshot', ok([{ rolled_count: 1 }]));

      await store.rollover();

      expect(store.lastRolledCount()).toBe(1);
      expect(messages()).toContain('1 task carried over from before today.');
    });

    it('pluralises more than one', async () => {
      db.onRpc('rollover_and_snapshot', ok([{ rolled_count: 3 }]));

      await store.rollover();

      expect(messages()).toContain('3 tasks carried over from before today.');
    });

    it('says nothing when nothing was carried', async () => {
      db.onRpc('rollover_and_snapshot', ok([{ rolled_count: 0 }]));

      await store.rollover();

      expect(toast.toasts()).toEqual([]);
    });

    it('reports a real failure, because a silent one hides yesterday', async () => {
      db.onRpc('rollover_and_snapshot', fail('permission denied'));

      await store.rollover();

      expect(errorToasts()).toContain('Could not carry unfinished tasks over.');
    });

    it('stays quiet when the connection is the problem', async () => {
      // Rollover runs on every open, including the ones with no connection.
      // It retries on the next one, so there is nothing to report.
      db.onRpc('rollover_and_snapshot', fail('Failed to fetch'));

      await store.rollover();

      expect(toast.toasts()).toEqual([]);
    });

    it('flushes queued writes before it runs', async () => {
      // A task completed offline yesterday has to land before rollover reads
      // the table, or it is carried forward as though it were still open.
      localStorage.setItem(
        `daybook.queue.v1.${USER_ID}`,
        JSON.stringify([{ op: 'update', id: 'task-1', patch: { completed_at: 'x' } }]),
      );
      db.onFrom('tasks', ok([]));

      await store.init();

      const rpcIndex = db.calls.findIndex((c) => c.kind === 'rpc');
      const updateIndex = db.calls.findIndex((c) => c.chain.some((s) => s.op === 'update'));
      expect(updateIndex).toBeGreaterThanOrEqual(0);
      expect(updateIndex).toBeLessThan(rpcIndex);
    });
  });

  describe('optimistic writes', () => {
    it('shows the change before the server has answered', async () => {
      await seed([makeTask({ text: 'call physio' })]);
      const task = store.tasks()[0];

      const pending = store.update(task, { text: 'call the physio back' });

      expect(store.taskById().get(task.id)?.text).toBe('call the physio back');
      await pending;
    });

    it('rolls back only the fields it changed when the server says no', async () => {
      await seed([makeTask({ text: 'call physio', energy: 'quick', reschedule_count: 2 })]);
      const task = store.tasks()[0];
      db.onFrom('tasks', fail('new row violates row-level security policy'));

      const saved = await store.update(task, { text: 'edited', energy: 'deep' });

      expect(saved).toBe(false);
      expect(store.taskById().get(task.id)).toEqual(task);
      expect(errorToasts()).toContain('Could not save that change.');
    });

    it('keeps the optimistic row when the write fails offline', async () => {
      await seed([makeTask({ text: 'call physio' })]);
      const task = store.tasks()[0];
      db.onFrom('tasks', fail('Failed to fetch'));

      const saved = await store.update(task, { text: 'edited' });

      expect(saved).toBe(true);
      expect(store.taskById().get(task.id)?.text).toBe('edited');
      expect(queue.pending()).toBe(1);
    });

    it('does not queue a rejection the server will keep making', async () => {
      await seed([makeTask()]);
      db.onFrom('tasks', fail('new row violates row-level security policy'));

      await store.update(store.tasks()[0], { text: 'edited' });

      expect(queue.pending()).toBe(0);
    });
  });

  describe('completing', () => {
    it('pins a completed task to today, so it lands in today log', async () => {
      // Finishing Friday work on a Wednesday must show up on Wednesday.
      await seed([makeTask({ scheduled_date: '2026-08-21' })]);

      await store.toggleComplete(store.tasks()[0]);

      const task = store.tasks()[0];
      expect(task.completed_at).not.toBeNull();
      expect(task.scheduled_date).toBe(TODAY);
    });

    it('offers an undo that puts the task back to open', async () => {
      await seed([makeTask()]);
      await store.toggleComplete(store.tasks()[0]);

      const done = toast.toasts().find((t) => t.message === 'Done.');
      expect(done).toBeDefined();
      toast.runUndo(done!);
      await settle();

      expect(store.tasks()[0].completed_at).toBeNull();
    });

    it('does not move the day when a task is reopened', async () => {
      await seed([
        makeTask({ scheduled_date: YESTERDAY, completed_at: `${YESTERDAY}T20:00:00.000Z` }),
      ]);

      await store.toggleComplete(store.tasks()[0]);

      expect(store.tasks()[0].completed_at).toBeNull();
      expect(store.tasks()[0].scheduled_date).toBe(YESTERDAY);
      expect(messages()).not.toContain('Done.');
    });

    it('offers no undo for a completion that did not save', async () => {
      await seed([makeTask()]);
      db.onFrom('tasks', fail('permission denied'));

      await store.toggleComplete(store.tasks()[0]);

      expect(messages()).not.toContain('Done.');
    });
  });

  describe('rescheduling', () => {
    it('counts a manual push, never a rollover', async () => {
      await seed([makeTask({ reschedule_count: 0, carried_over_count: 0 })]);

      await store.reschedule(store.tasks()[0], TOMORROW);

      expect(store.tasks()[0].scheduled_date).toBe(TOMORROW);
      expect(store.tasks()[0].reschedule_count).toBe(1);
      expect(store.tasks()[0].carried_over_count).toBe(0);
    });

    it('counts undoing a push as another push', async () => {
      // Deliberate: the count measures how much a task has been shoved about,
      // and shoving it back is more of that, not less.
      await seed([makeTask({ scheduled_date: TODAY })]);
      await store.reschedule(store.tasks()[0], TOMORROW);

      toast.runUndo(toast.toasts().find((t) => t.message === 'Moved.')!);
      await settle();

      expect(store.tasks()[0].scheduled_date).toBe(TODAY);
      expect(store.tasks()[0].reschedule_count).toBe(2);
    });
  });

  describe('adding from the capture box', () => {
    beforeEach(() => {
      db.onFrom('tasks', ok(makeTask({ id: 'saved-by-server', text: 'call physio' })));
    });

    it('refuses an input that is all tags and no task', async () => {
      const added = await store.addFromCapture('#home !quick');

      expect(added).toBe(false);
      expect(store.tasks()).toEqual([]);
      expect(errorToasts()).toContain('That is all tags and no task.');
    });

    it('refuses an empty input without a toast', async () => {
      expect(await store.addFromCapture('   ')).toBe(false);
      expect(toast.toasts()).toEqual([]);
    });

    it('refuses to add with no session, because the row would have no owner', async () => {
      session.apply(null);

      expect(await store.addFromCapture('call physio')).toBe(false);
      expect(store.tasks()).toEqual([]);
    });

    it('puts the row on screen before the insert resolves', async () => {
      const pending = store.addFromCapture('call physio');
      await Promise.resolve();
      await Promise.resolve();

      // Under the client id, not the server one. Asserting only on the count
      // would pass just as well against a pessimistic write that had already
      // finished by this point.
      expect(store.tasks()).toHaveLength(1);
      expect(store.tasks()[0].id).not.toBe('saved-by-server');
      await pending;
    });

    it('sends the client id, so an offline edit can reference it later', async () => {
      await store.addFromCapture('call physio');

      const sent = argsFor('tasks', 'insert')[0][0] as Task;
      expect(sent.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(sent.user_id).toBe(USER_ID);
      expect(sent.text).toBe('call physio');
      expect(sent.created_date).toBe(TODAY);
    });

    it('swaps the optimistic row for the stored one', async () => {
      expect(await store.addFromCapture('call physio')).toBe(true);

      expect(store.tasks().map((t) => t.id)).toEqual(['saved-by-server']);
    });

    it('names the day it landed on, because a future task is never seen', async () => {
      await store.addFromCapture('call physio', { scheduled_date: TOMORROW, reminder_at: null });

      expect(messages()).toContain('Added to tomorrow.');
    });

    it('lets the date picker override the day the text parsed to', async () => {
      await store.addFromCapture('call physio tomorrow', {
        scheduled_date: '2026-08-25',
        reminder_at: null,
      });

      const sent = argsFor('tasks', 'insert')[0][0] as Task;
      expect(sent.scheduled_date).toBe('2026-08-25');
      expect(sent.reminder_at).toBeNull();
    });

    it('pulls the row back out and says so when the server rejects it', async () => {
      db.onFrom('tasks', fail('new row violates row-level security policy'));

      expect(await store.addFromCapture('call physio')).toBe(false);

      expect(store.tasks()).toEqual([]);
      expect(errorToasts()).toContain('Could not save that task.');
      // The "Added to today." toast has to go with it, or the app claims the
      // save worked and admits it failed in the same breath.
      expect(messages()).not.toContain('Added to today.');
    });

    it('keeps the row and queues the insert when there is no connection', async () => {
      db.onFrom('tasks', fail('Failed to fetch'));

      expect(await store.addFromCapture('call physio')).toBe(true);

      expect(store.tasks()).toHaveLength(1);
      expect(queue.pending()).toBe(1);
    });

    it('deletes the stored row when undo is pressed after the insert landed', async () => {
      await store.addFromCapture('call physio');
      db.calls.length = 0;

      toast.runUndo(toast.toasts().find((t) => t.message.startsWith('Added to'))!);
      await settle();

      expect(store.tasks()).toEqual([]);
      expect(argsFor('tasks', 'delete')).toHaveLength(1);
      expect(argsFor('tasks', 'eq')[0]).toEqual(['id', 'saved-by-server']);
    });

    it('cleans up after itself when undo beats the insert home', async () => {
      // Undo can be pressed while the insert is still in flight, when there is
      // no server row to delete yet. Pressing it the instant the toast appears
      // is exactly that moment, and is deterministic where a timing race is
      // not.
      const realShow = toast.show;
      vi.spyOn(toast, 'show').mockImplementation((message: string, undo?: () => void) => {
        const id = realShow.call(toast, message, undo);
        undo?.();
        return id;
      });

      expect(await store.addFromCapture('call physio')).toBe(false);

      expect(store.tasks()).toEqual([]);
      // The row reached the server anyway, so the server copy has to go too.
      expect(argsFor('tasks', 'delete')).toHaveLength(1);
    });

    it('creates a category an unknown #slug names rather than dropping the tag', async () => {
      db.onFrom('categories', ok(makeCategory({ id: 'cat-new', slug: 'physio', name: 'Physio' })));

      await store.addFromCapture('call physio #physio');

      const created = argsFor('categories', 'insert')[0][0] as Record<string, unknown>;
      expect(created['slug']).toBe('physio');
      expect(created['name']).toBe('Physio');
      expect(store.categories().map((c) => c.id)).toEqual(['cat-new']);
      expect((argsFor('tasks', 'insert')[0][0] as Task).category_id).toBe('cat-new');
    });

    it('reuses a category that already exists', async () => {
      db.onFrom('categories', ok(makeDefaultCategories()));
      await store.loadCategories();
      const home = store.categories().find((c) => c.slug === 'home')!;
      db.calls.length = 0;

      await store.addFromCapture('call physio #home');

      expect(argsFor('categories', 'insert')).toEqual([]);
      expect((argsFor('tasks', 'insert')[0][0] as Task).category_id).toBe(home.id);
    });
  });

  describe('editing from the capture box', () => {
    it('counts pushing a task later as a manual reschedule', async () => {
      await seed([makeTask({ scheduled_date: TODAY, reschedule_count: 0 })]);

      await store.editFromCapture(store.tasks()[0], 'call physio tomorrow');

      expect(store.tasks()[0].scheduled_date).toBe(TOMORROW);
      expect(store.tasks()[0].reschedule_count).toBe(1);
    });

    it('does not count pulling a task earlier', async () => {
      // Dragging work forward is not avoidance, and counting it would poison
      // the "what do I keep avoiding" number.
      await seed([makeTask({ scheduled_date: TOMORROW, reschedule_count: 0 })]);

      await store.editFromCapture(store.tasks()[0], 'call physio today');

      expect(store.tasks()[0].scheduled_date).toBe(TODAY);
      expect(store.tasks()[0].reschedule_count).toBe(0);
    });

    it('refuses an edit that leaves no task text', async () => {
      await seed([makeTask({ text: 'call physio' })]);

      expect(await store.editFromCapture(store.tasks()[0], '#home')).toBe(false);
      expect(store.tasks()[0].text).toBe('call physio');
    });
  });

  describe('deleting', () => {
    it('removes the row and offers an undo instead of asking first', async () => {
      await seed([makeTask()]);
      const task = store.tasks()[0];

      await store.removeWithUndo(task);

      expect(store.tasks()).toEqual([]);
      expect(argsFor('tasks', 'delete')).toHaveLength(1);
      expect(messages()).toContain('Deleted.');
    });

    it('brings the task back under its original id, not as a copy', async () => {
      await seed([makeTask({ text: 'call physio' })]);
      const task = store.tasks()[0];
      await store.removeWithUndo(task);
      db.calls.length = 0;

      toast.runUndo(toast.toasts().find((t) => t.message === 'Deleted.')!);
      await settle();

      expect(store.tasks()).toEqual([task]);
      expect(argsFor('tasks', 'insert')[0][0]).toEqual(task);
    });

    it('puts the task back when the delete is refused', async () => {
      await seed([makeTask()]);
      const task = store.tasks()[0];
      db.onFrom('tasks', fail('permission denied'));

      await store.remove(task);

      expect(store.tasks()).toEqual([task]);
      expect(errorToasts()).toContain('Could not delete that task.');
    });

    it('keeps the row deleted and queues it when there is no connection', async () => {
      await seed([makeTask()]);
      db.onFrom('tasks', fail('Load failed'));

      await store.remove(store.tasks()[0]);

      expect(queue.pending()).toBe(1);
    });
  });

  describe('categories', () => {
    beforeEach(async () => {
      db.onFrom('categories', ok(makeDefaultCategories()));
      await store.loadCategories();
      db.calls.length = 0;
    });

    it('renames a category optimistically and rolls back on failure', async () => {
      const home = store.categories().find((c) => c.slug === 'home')!;
      db.onFrom('categories', fail('permission denied'));

      await store.updateCategory(home, { name: 'House' });

      expect(store.categoryById().get(home.id)?.name).toBe('Home');
      expect(errorToasts()).toContain('Could not save that category.');
    });

    it('untags the tasks a deleted category owned instead of leaving a blank chip', async () => {
      const home = store.categories().find((c) => c.slug === 'home')!;
      await seed([makeTask({ category_id: home.id }), makeTask({ category_id: null })]);
      store.setCategoryFilter(home.id);

      await store.removeCategory(home);

      expect(store.categories().map((c) => c.slug)).not.toContain('home');
      expect(store.tasks().every((t) => t.category_id === null)).toBe(true);
      expect(store.categoryFilter()).toBeNull();
    });

    it('restores both the category and its tasks when the delete fails', async () => {
      const home = store.categories().find((c) => c.slug === 'home')!;
      await seed([makeTask({ category_id: home.id })]);
      db.onFrom('categories', fail('permission denied'));

      await store.removeCategory(home);

      expect(store.categories().map((c) => c.id)).toContain(home.id);
      expect(store.tasks()[0].category_id).toBe(home.id);
      expect(errorToasts()).toContain('Could not delete that category.');
    });
  });

  describe('what the day shows', () => {
    const work = makeCategory({ id: 'cat-work', slug: 'work' });
    const home = makeCategory({ id: 'cat-home', slug: 'home' });

    beforeEach(async () => {
      db.onFrom('categories', ok([work, home]));
      await store.loadCategories();
      await seed([
        makeTask({
          id: 'open-quick',
          scheduled_date: TODAY,
          energy: 'quick',
          category_id: work.id,
        }),
        makeTask({ id: 'open-deep', scheduled_date: TODAY, energy: 'deep', category_id: null }),
        makeTask({
          id: 'done',
          scheduled_date: TODAY,
          energy: 'quick',
          category_id: work.id,
          completed_at: `${TODAY}T10:00:00.000Z`,
        }),
        makeTask({ id: 'tomorrow', scheduled_date: TOMORROW }),
        makeTask({ id: 'next-week', scheduled_date: '2026-08-25' }),
        makeTask({ id: 'beyond-the-strip', scheduled_date: '2026-08-30' }),
        makeTask({ id: 'yesterday', scheduled_date: YESTERDAY }),
      ]);
    });

    it('splits today into what is left and what it amounted to', () => {
      expect(store.openTasks().map((t) => t.id)).toEqual(['open-quick', 'open-deep']);
      expect(store.doneTasks().map((t) => t.id)).toEqual(['done']);
      expect(store.openCount()).toBe(2);
      expect(store.completedCount()).toBe(1);
    });

    it('reports whether anything is hidden, so the empty state can say why', () => {
      expect(store.filtered()).toBe(false);

      store.setFilter('deep');
      expect(store.filtered()).toBe(true);
      expect(store.visibleTasks().map((t) => t.id)).toEqual(['open-deep']);

      store.clearFilters();
      expect(store.filtered()).toBe(false);
      expect(store.visibleTasks()).toHaveLength(3);
    });

    it('applies the energy and category filters together', () => {
      store.setFilter('quick');
      store.setCategoryFilter(work.id);

      expect(store.visibleTasks().map((t) => t.id)).toEqual(['open-quick', 'done']);
    });

    it('offers only the categories with something on today', () => {
      // An empty chip filters to nothing, so it must not be offered.
      expect(store.todaysCategories().map((c) => c.id)).toEqual([work.id]);
    });

    it('looks a week ahead, starting tomorrow', () => {
      expect(store.upcoming().map((d) => d.date)).toEqual([TOMORROW, '2026-08-25']);
      expect(store.upcomingCount()).toBe(2);
    });

    it('counts open work per day for the calendar', () => {
      expect(store.openCountByDate().get(TODAY)).toBe(2);
      expect(store.openCountByDate().get(TOMORROW)).toBe(1);
    });

    it('indexes tasks by id for the deep-linked card', () => {
      expect(store.taskById().get('tomorrow')?.scheduled_date).toBe(TOMORROW);
    });

    it('toggles the upcoming strip', () => {
      expect(store.upcomingOpen()).toBe(false);
      store.toggleUpcoming();
      expect(store.upcomingOpen()).toBe(true);
    });
  });
});
