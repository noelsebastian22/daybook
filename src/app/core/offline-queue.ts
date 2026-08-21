import { computed, inject, Injectable, signal } from '@angular/core';
import { Supabase } from './supabase';
import type { Task } from './models';

export type QueuedWrite =
  | { op: 'insert'; row: Task }
  | { op: 'update'; id: string; patch: Partial<Task> }
  | { op: 'delete'; id: string };

const STORAGE_KEY = 'daybook.queue.v1';

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

  private readonly writes = signal<QueuedWrite[]>(read());

  readonly pending = computed(() => this.writes().length);

  /** Guards against a visibilitychange and an online event flushing at once. */
  private flushing = false;

  constructor() {
    globalThis.addEventListener?.('online', () => void this.flush());
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.flush();
    });
  }

  enqueue(write: QueuedWrite): void {
    const next = [...this.writes(), write];
    this.writes.set(next);
    persist(next);
  }

  /**
   * Replays what the last session could not send. Called on startup *before*
   * the task list is fetched, so the server has the writes before it is asked
   * what it holds.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.writes().length === 0) return;
    if (globalThis.navigator && !navigator.onLine) return;
    this.flushing = true;

    try {
      while (this.writes().length > 0) {
        const [next, ...rest] = this.writes();
        const failed = await this.send(next);
        if (failed) return;
        this.writes.set(rest);
        persist(rest);
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

function read(): QueuedWrite[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

function persist(writes: QueuedWrite[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(writes));
  } catch {
    // Private mode, or the quota is full. The in-memory queue still works for
    // this session; only surviving a reload is lost.
  }
}
