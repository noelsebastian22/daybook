import { computed, inject, Injectable, signal } from '@angular/core';
import { Supabase } from './supabase';
import { SessionStore } from './session.store';
import type { Task } from './models';

export type QueuedWrite =
  | { op: 'insert'; row: Task }
  | { op: 'update'; id: string; patch: Partial<Task> }
  | { op: 'delete'; id: string };

/**
 * The pre-multi-tenancy key: one queue for the whole browser, with no user
 * in it. Read once per browser and then retired — see {@link adoptLegacy}.
 */
const LEGACY_KEY = 'daybook.queue.v1';
const LEGACY_CLAIMED_KEY = 'daybook.queue.v1.claimed';

/**
 * Queued writes are per user, not per browser.
 *
 * The flat key was a silent data-loss bug the moment a second account
 * existed on one device: A signs out with writes queued, B signs in, and
 * `flush()` replays A's writes under B's session. The inserts carry A's
 * `user_id`, RLS rejects them, `isOffline()` reads false, and `send()` drops
 * them — A's offline work gone with no toast. The updates and deletes are
 * `.eq('id', …)` only, so RLS scopes them to B, they match nothing, and they
 * are dropped too.
 *
 * It failed safe rather than leaking, and only because of the `with check` on
 * the tasks policy. That is a lot of weight for a localStorage key to be
 * putting on a database constraint.
 */
function storageKey(userId: string): string {
  return `daybook.queue.v1.${userId}`;
}

/**
 * True when an error is the connection failing rather than the server saying
 * no. The distinction decides whether a write is queued or rolled back:
 * queueing a genuine RLS rejection would retry it forever.
 *
 * supabase-js surfaces a dropped fetch as a message rather than a status, and
 * the wording differs per browser — "Failed to fetch" in Chrome, "Load failed"
 * in Safari, "NetworkError" in Firefox.
 */
export function isOffline(error: { message?: string } | null): boolean {
  if (globalThis.navigator && !navigator.onLine) return true;
  const message = error?.message ?? '';
  return /failed to fetch|load failed|networkerror|network request failed/i.test(message);
}

/**
 * A durable queue of task writes made with no connection.
 *
 * iOS has no Background Sync API, so replay is a foreground affair: it runs
 * when the tab comes back, when the browser says it is online again, and once
 * at startup. There is no background retry and there cannot be one.
 *
 * Order is preserved and the queue stops at the first failure rather than
 * skipping past it, because these writes are not independent — an update to a
 * task whose insert has not landed would be an update to nothing.
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueue {
  private readonly sb = inject(Supabase);
  private readonly session = inject(SessionStore);

  private readonly writes = signal<QueuedWrite[]>([]);

  /** The user id {@link writes} was loaded for. Null means nobody yet. */
  private writesFor: string | null = null;

  /**
   * Stale until the first {@link sync}, which happens in `flush()` during
   * `TaskStore.init()` — before anything renders a pending count.
   */
  readonly pending = computed(() => this.writes().length);

  /** Guards against a visibilitychange and an online event flushing at once. */
  private flushing = false;

  constructor() {
    globalThis.addEventListener?.('online', () => void this.flush());
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.flush();
    });
  }

  /**
   * Points the in-memory queue at the signed-in user's stored one.
   *
   * Called at the top of every operation rather than driven by an effect:
   * `flush()` runs inside `TaskStore.init()`, which can be reached before an
   * effect would have settled, and flushing the wrong user's queue is the
   * exact bug this class is being fixed for. Cheap and idempotent, so the
   * repetition costs nothing.
   */
  private sync(): void {
    const uid = this.session.userId();
    if (uid === this.writesFor) return;
    this.writesFor = uid;
    this.writes.set(uid ? read(uid) : []);
  }

  enqueue(write: QueuedWrite): void {
    this.sync();
    // No session means no owner, and a write with no owner can only ever be
    // rejected. Dropping it here beats persisting something unsendable.
    if (!this.writesFor) return;
    const next = [...this.writes(), write];
    this.writes.set(next);
    persist(this.writesFor, next);
  }

  /**
   * Replays what the last session could not send. Called on startup *before*
   * the task list is fetched, so the server has the writes before it is asked
   * what it holds.
   */
  async flush(): Promise<void> {
    this.sync();
    const owner = this.writesFor;
    if (!owner) return;
    if (this.flushing || this.writes().length === 0) return;
    if (globalThis.navigator && !navigator.onLine) return;
    this.flushing = true;

    try {
      while (this.writes().length > 0) {
        // The session can end mid-flush — an expired token, a sign-out in
        // another tab. Stop rather than send the rest of this user's writes
        // under whatever session replaces theirs.
        if (this.session.userId() !== owner) return;
        const [next, ...rest] = this.writes();
        const failed = await this.send(next);
        if (failed) return;
        this.writes.set(rest);
        persist(owner, rest);
      }
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Replays the queue over a freshly loaded task list.
   *
   * Without this, opening the app offline shows the server's last known state
   * and everything written since looks lost — which is the exact bug the queue
   * exists to fix.
   */
  applyTo(tasks: Task[]): Task[] {
    this.sync();
    return applyWrites(tasks, this.writes());
  }

  /** Returns true when the write should stay queued. */
  private async send(write: QueuedWrite): Promise<boolean> {
    const table = this.sb.client.from('tasks');
    const { error } =
      write.op === 'insert'
        ? await table.insert(write.row)
        : write.op === 'update'
          ? await table.update(write.patch).eq('id', write.id)
          : await table.delete().eq('id', write.id);

    if (!error) return false;
    // Still offline: keep it and try again on the next wake-up. A rejection
    // from the server is dropped instead — retrying it cannot change it, and
    // a stuck head blocks every write behind it.
    return isOffline(error);
  }
}

/**
 * Replays writes over a task list, in order.
 *
 * Split out of the service so it can be tested without DI — it is the only
 * part of the queue with logic worth getting wrong. An update to a task that
 * is not there is dropped rather than resurrecting it: the pairing case is a
 * delete queued behind an update, and reviving the row would undo the delete.
 */
export function applyWrites(tasks: Task[], writes: QueuedWrite[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const write of writes) {
    switch (write.op) {
      case 'insert':
        byId.set(write.row.id, write.row);
        break;
      case 'update': {
        const existing = byId.get(write.id);
        if (existing) byId.set(write.id, { ...existing, ...write.patch });
        break;
      }
      case 'delete':
        byId.delete(write.id);
        break;
    }
  }
  return [...byId.values()];
}

function read(userId: string): QueuedWrite[] {
  adoptLegacy(userId);
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

function persist(userId: string, writes: QueuedWrite[]): void {
  try {
    globalThis.localStorage?.setItem(storageKey(userId), JSON.stringify(writes));
  } catch {
    // Private mode, or the quota is full. The in-memory queue still works for
    // this session; only surviving a reload is lost.
  }
}

/**
 * Hands the old browser-wide queue to the first user who signs in after the
 * upgrade, once, then retires the key.
 *
 * Discarding it instead would be the conservative-looking choice and it is
 * the wrong one: the writes in there are real and unsent, and there is
 * exactly one account in existence, so "the first user to sign in" and "the
 * user who queued them" are the same person. The claim flag is what keeps
 * that true — without it, a second account signing in on this browser before
 * the first one does would inherit them.
 *
 * Deleted rather than left in place so this can only ever happen once, on
 * one device, regardless of what the flag says later.
 */
function adoptLegacy(userId: string): void {
  try {
    const store = globalThis.localStorage;
    if (!store) return;
    if (store.getItem(LEGACY_CLAIMED_KEY)) return;

    const legacy = store.getItem(LEGACY_KEY);
    store.setItem(LEGACY_CLAIMED_KEY, '1');
    store.removeItem(LEGACY_KEY);

    // Never overwrite a queue the new key already holds.
    if (legacy && !store.getItem(storageKey(userId))) {
      store.setItem(storageKey(userId), legacy);
    }
  } catch {
    // Same as persist(): storage unavailable is survivable.
  }
}
