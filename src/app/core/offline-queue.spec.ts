import { describe, expect, it } from 'vitest';
import { applyWrites, isOffline, type QueuedWrite } from './offline-queue';
import type { Task } from './models';

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
