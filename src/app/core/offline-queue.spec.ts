import { TestBed } from '@angular/core/testing';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeSupabase, fail, ok } from '../../testing/fake-supabase';
import { OTHER_USER_ID, USER_ID } from '../../testing/fakes';
import type { Task } from './models';
import { applyWrites, isOffline, OfflineQueue, type QueuedWrite } from './offline-queue';
import { Push } from './push';
import { SessionStore } from './session.store';
import { Supabase } from './supabase';

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    user_id: 'u1',
    text: id,
    created_date: '2026-08-21',
    scheduled_date: '2026-08-21',
    completed_at: null,
    energy: null,
    category_id: null,
    reminder_at: null,
    carried_over_count: 0,
    reschedule_count: 0,
    created_at: '2026-08-21T00:00:00.000Z',
    ...over,
  };
}

describe('isOffline', () => {
  it('recognises each browser wording for a dropped fetch', () => {
    expect(isOffline({ message: 'TypeError: Failed to fetch' })).toBe(true);
    expect(isOffline({ message: 'Load failed' })).toBe(true);
    expect(isOffline({ message: 'NetworkError when attempting to fetch' })).toBe(true);
  });

  it('does not treat a server rejection as offline', () => {
    // The distinction that matters: this must roll back, not queue forever.
    expect(isOffline({ message: 'new row violates row-level security policy' })).toBe(false);
    expect(isOffline({ message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isOffline(null)).toBe(false);
  });
});

describe('applyWrites', () => {
  it('layers a queued insert back over the server list', () => {
    const writes: QueuedWrite[] = [{ op: 'insert', row: task('new') }];
    const result = applyWrites([task('a')], writes);

    expect(result.map((t) => t.id).sort()).toEqual(['a', 'new']);
  });

  it('applies a queued update to a task the server already knows', () => {
    const writes: QueuedWrite[] = [
      { op: 'update', id: 'a', patch: { completed_at: '2026-08-21T01:00:00.000Z' } },
    ];
    const result = applyWrites([task('a')], writes);

    expect(result[0].completed_at).toBe('2026-08-21T01:00:00.000Z');
  });

  it('removes a queued delete', () => {
    const result = applyWrites([task('a'), task('b')], [{ op: 'delete', id: 'a' }]);

    expect(result.map((t) => t.id)).toEqual(['b']);
  });

  it('replays in order, so a later delete beats an earlier insert', () => {
    const writes: QueuedWrite[] = [
      { op: 'insert', row: task('tmp') },
      { op: 'update', id: 'tmp', patch: { text: 'edited' } },
      { op: 'delete', id: 'tmp' },
    ];

    expect(applyWrites([], writes)).toEqual([]);
  });

  it('drops an update to a task that is not there rather than reviving it', () => {
    const writes: QueuedWrite[] = [
      { op: 'delete', id: 'a' },
      { op: 'update', id: 'a', patch: { text: 'edited' } },
    ];

    expect(applyWrites([task('a')], writes)).toEqual([]);
  });
});

/* ------------------------------------------------------------------
   The service itself. `applyWrites` above is the pure half; this is the
   half that decides whose queue is being replayed, which is a security
   property rather than a convenience one.
   ------------------------------------------------------------------ */

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

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

const keyFor = (userId: string) => `daybook.queue.v1.${userId}`;

function stored(userId: string): QueuedWrite[] {
  const raw = localStorage.getItem(keyFor(userId));
  return raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
}

describe('OfflineQueue', () => {
  let db: FakeSupabase;
  let session: InstanceType<typeof SessionStore>;
  let queue: OfflineQueue;

  const tasksCalls = () => db.calls.filter((c) => c.kind === 'from' && c.name === 'tasks');

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: Push, useClass: FakePush }] });
    db = TestBed.inject(Supabase) as unknown as FakeSupabase;
    session = TestBed.inject(SessionStore);
    await settle();
    session.apply(sessionFor(USER_ID));
    queue = TestBed.inject(OfflineQueue);
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  describe('whose queue it is', () => {
    it('stores a write under the user who made it', () => {
      queue.enqueue({ op: 'delete', id: 'task-1' });

      expect(stored(USER_ID)).toEqual([{ op: 'delete', id: 'task-1' }]);
      expect(queue.pending()).toBe(1);
    });

    it('will not replay one account writes under another account session', async () => {
      // The flat key was silent data loss the moment a second account existed
      // on one device: A's inserts carry A's user_id, RLS rejects them,
      // `isOffline()` reads false and they are dropped with no toast.
      localStorage.setItem(keyFor(USER_ID), JSON.stringify([{ op: 'delete', id: 'a-task' }]));
      session.apply(sessionFor(OTHER_USER_ID));

      await queue.flush();

      expect(tasksCalls()).toEqual([]);
      expect(stored(USER_ID)).toHaveLength(1);
    });

    it('does not layer one account queued writes over another account list', () => {
      localStorage.setItem(
        keyFor(USER_ID),
        JSON.stringify([{ op: 'insert', row: task('a-private-task') }]),
      );
      session.apply(sessionFor(OTHER_USER_ID));

      expect(queue.applyTo([task('theirs')]).map((t) => t.id)).toEqual(['theirs']);
    });

    it('drops a write made with no session, because it can only ever be rejected', () => {
      session.apply(null);

      queue.enqueue({ op: 'delete', id: 'task-1' });

      expect(queue.pending()).toBe(0);
      expect(localStorage.length).toBe(0);
    });

    it('picks up the queue the signed-in user left behind', () => {
      localStorage.setItem(keyFor(USER_ID), JSON.stringify([{ op: 'delete', id: 'task-1' }]));

      expect(queue.applyTo([task('task-1')])).toEqual([]);
    });

    it('survives storage it cannot parse', () => {
      localStorage.setItem(keyFor(USER_ID), 'not json');

      expect(queue.applyTo([task('a')]).map((t) => t.id)).toEqual(['a']);
    });
  });

  describe('adopting the pre-multi-tenancy queue', () => {
    const LEGACY = 'daybook.queue.v1';

    it('hands the browser-wide queue to the first user to sign in', () => {
      // There is exactly one account in existence, so "the first user to sign
      // in" and "the user who queued them" are the same person, and the writes
      // in there are real and unsent.
      localStorage.setItem(LEGACY, JSON.stringify([{ op: 'delete', id: 'old-task' }]));

      queue.applyTo([]);

      expect(stored(USER_ID)).toEqual([{ op: 'delete', id: 'old-task' }]);
      expect(localStorage.getItem(LEGACY)).toBeNull();
    });

    it('does not hand it to a second account signing in afterwards', () => {
      localStorage.setItem(LEGACY, JSON.stringify([{ op: 'delete', id: 'old-task' }]));
      queue.applyTo([]);

      session.apply(sessionFor(OTHER_USER_ID));
      queue.applyTo([]);

      expect(stored(OTHER_USER_ID)).toEqual([]);
    });

    it('never overwrites a queue the new key already holds', () => {
      localStorage.setItem(LEGACY, JSON.stringify([{ op: 'delete', id: 'old-task' }]));
      localStorage.setItem(keyFor(USER_ID), JSON.stringify([{ op: 'delete', id: 'newer-task' }]));

      queue.applyTo([]);

      expect(stored(USER_ID)).toEqual([{ op: 'delete', id: 'newer-task' }]);
    });
  });

  describe('flushing', () => {
    it('replays every write in order and empties the queue', async () => {
      const row = task('made-offline');
      queue.enqueue({ op: 'insert', row });
      queue.enqueue({ op: 'update', id: 'made-offline', patch: { text: 'edited' } });
      queue.enqueue({ op: 'delete', id: 'other' });

      await queue.flush();

      expect(tasksCalls().map((c) => c.chain.map((s) => s.op).join('.'))).toEqual([
        'insert',
        'update.eq',
        'delete.eq',
      ]);
      expect(tasksCalls()[0].chain[0].args[0]).toEqual(row);
      expect(queue.pending()).toBe(0);
      expect(stored(USER_ID)).toEqual([]);
    });

    it('stops at a write that is still offline and keeps everything behind it', async () => {
      // These writes are not independent: an update to a task whose insert has
      // not landed would be an update to nothing.
      queue.enqueue({ op: 'insert', row: task('made-offline') });
      queue.enqueue({ op: 'update', id: 'made-offline', patch: { text: 'edited' } });
      db.onFrom('tasks', fail('Failed to fetch'));

      await queue.flush();

      expect(tasksCalls()).toHaveLength(1);
      expect(queue.pending()).toBe(2);

      db.onFrom('tasks', ok([]));
      await queue.flush();

      expect(queue.pending()).toBe(0);
    });

    it('drops a write the server rejected rather than retrying it forever', async () => {
      // Retrying cannot change the answer, and a stuck head blocks every write
      // behind it.
      queue.enqueue({ op: 'insert', row: task('rejected') });
      queue.enqueue({ op: 'delete', id: 'other' });
      db.onFrom('tasks', fail('new row violates row-level security policy'));

      await queue.flush();

      expect(queue.pending()).toBe(0);
      expect(tasksCalls()).toHaveLength(2);
    });

    it('sends nothing while the browser says it is offline', async () => {
      queue.enqueue({ op: 'delete', id: 'task-1' });
      vi.stubGlobal('navigator', { onLine: false });

      await queue.flush();

      expect(tasksCalls()).toEqual([]);
      expect(queue.pending()).toBe(1);
    });

    it('stops the moment the session changes underneath it', async () => {
      // An expired token or a sign-out in another tab, mid-flush. The rest of
      // this user's writes must not go out under whatever session replaces
      // theirs. The session is cleared as the first write is answered.
      queue.enqueue({ op: 'delete', id: 'first' });
      queue.enqueue({ op: 'delete', id: 'second' });
      db.onFrom('tasks', {
        data: null,
        get error() {
          session.apply(null);
          return null;
        },
      });

      await queue.flush();

      expect(tasksCalls()).toHaveLength(1);
      expect(stored(USER_ID)).toEqual([{ op: 'delete', id: 'second' }]);
    });

    it('does nothing with an empty queue', async () => {
      await queue.flush();

      expect(tasksCalls()).toEqual([]);
    });
  });
});
