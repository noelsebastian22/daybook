import { describe, expect, it } from 'vitest';

import {
  makeCategory,
  makeSnapshot,
  makeTask,
  TODAY,
  TOMORROW,
  YESTERDAY,
} from '../../testing/fakes';
import type { DaySnapshot, Scheduling, Task } from './models';
import {
  countOpenBetween,
  countOpenByDate,
  fieldsOf,
  filterTasks,
  groupUpcoming,
  mergeSnapshots,
  mergeTasksById,
  resolveScheduling,
  rolledCount,
  sortForDay,
  tasksForDay,
} from './task.helpers';

/**
 * The pure half of the task logic. No injector, no clock, no Supabase — every
 * day these functions reason about is passed in, which is the property the
 * file's own header asks for and the reason these are the cheapest tests in
 * the repo to trust.
 */

/** A task written at a known moment, so `created_at` ordering is deliberate. */
function at(hour: number, over: Partial<Task> = {}): Task {
  return makeTask({ created_at: `${TODAY}T${String(hour).padStart(2, '0')}:00:00.000Z`, ...over });
}

describe('sortForDay', () => {
  it('puts open tasks above completed ones', () => {
    const open = makeTask({ completed_at: null });
    const done = makeTask({ completed_at: `${TODAY}T10:00:00.000Z` });

    expect([done, open].sort(sortForDay)).toEqual([open, done]);
  });

  it('orders open tasks by when they were written', () => {
    const first = at(9);
    const second = at(11);

    expect([second, first].sort(sortForDay)).toEqual([first, second]);
  });

  it('orders completed tasks by when they were finished, newest last', () => {
    const early = makeTask({ completed_at: `${TODAY}T10:00:00.000Z` });
    const late = makeTask({ completed_at: `${TODAY}T18:00:00.000Z` });

    expect([late, early].sort(sortForDay)).toEqual([early, late]);
  });
});

describe('tasksForDay', () => {
  it('keeps only the tasks scheduled on that day', () => {
    const todays = makeTask({ scheduled_date: TODAY });
    const tomorrows = makeTask({ scheduled_date: TOMORROW });

    expect(tasksForDay([todays, tomorrows], TODAY)).toEqual([todays]);
  });

  it('returns them in the order the day list shows them', () => {
    const done = at(8, { completed_at: `${TODAY}T09:00:00.000Z` });
    const late = at(12);
    const early = at(10);

    expect(tasksForDay([done, late, early], TODAY)).toEqual([early, late, done]);
  });

  it('does not reorder the array it was given', () => {
    // The store hands it `store.tasks()`, and `sort` mutates in place.
    const late = at(12);
    const early = at(10);
    const input = [late, early];

    tasksForDay(input, TODAY);

    expect(input).toEqual([late, early]);
  });
});

describe('filterTasks', () => {
  const quick = makeTask({ energy: 'quick', category_id: 'cat-work' });
  const deep = makeTask({ energy: 'deep', category_id: 'cat-home' });
  const untagged = makeTask({ energy: null, category_id: null });
  const all = [quick, deep, untagged];

  it('lets everything through when neither filter is set', () => {
    expect(filterTasks(all, 'all', null)).toEqual(all);
  });

  it('filters on energy alone', () => {
    expect(filterTasks(all, 'deep', null)).toEqual([deep]);
  });

  it('filters on category alone', () => {
    expect(filterTasks(all, 'all', 'cat-work')).toEqual([quick]);
  });

  it('ands the two filters rather than making them exclusive', () => {
    // They answer different questions, so both may be on at once.
    expect(filterTasks(all, 'quick', 'cat-work')).toEqual([quick]);
    expect(filterTasks(all, 'deep', 'cat-work')).toEqual([]);
  });
});

describe('groupUpcoming', () => {
  it('buckets open tasks by day, in date order', () => {
    const later = makeTask({ scheduled_date: '2026-08-21' });
    const soon = makeTask({ scheduled_date: TOMORROW });
    const alsoSoon = makeTask({ scheduled_date: TOMORROW });

    const days = groupUpcoming([later, soon, alsoSoon], TOMORROW, '2026-08-25');

    expect(days.map((d) => d.date)).toEqual([TOMORROW, '2026-08-21']);
    expect(days[0].tasks).toEqual([soon, alsoSoon]);
  });

  it('omits days with nothing on them rather than listing them empty', () => {
    const days = groupUpcoming(
      [makeTask({ scheduled_date: '2026-08-22' })],
      TOMORROW,
      '2026-08-25',
    );

    expect(days.map((d) => d.date)).toEqual(['2026-08-22']);
  });

  it('ignores completed tasks — the strip is what is left, not what happened', () => {
    const done = makeTask({ scheduled_date: TOMORROW, completed_at: `${TOMORROW}T10:00:00.000Z` });

    expect(groupUpcoming([done], TOMORROW, '2026-08-25')).toEqual([]);
  });

  it('includes both ends of the window', () => {
    const start = makeTask({ scheduled_date: TOMORROW });
    const end = makeTask({ scheduled_date: '2026-08-25' });
    const past = makeTask({ scheduled_date: '2026-08-26' });

    const days = groupUpcoming([start, end, past], TOMORROW, '2026-08-25');

    expect(days.map((d) => d.date)).toEqual([TOMORROW, '2026-08-25']);
  });
});

describe('countOpenBetween', () => {
  it('counts open tasks inside the window and nothing outside it', () => {
    const tasks = [
      makeTask({ scheduled_date: YESTERDAY }),
      makeTask({ scheduled_date: TOMORROW }),
      makeTask({ scheduled_date: '2026-08-25' }),
      makeTask({ scheduled_date: '2026-08-26' }),
    ];

    expect(countOpenBetween(tasks, TOMORROW, '2026-08-25')).toBe(2);
  });

  it('does not count completed work', () => {
    const done = makeTask({ scheduled_date: TOMORROW, completed_at: `${TOMORROW}T10:00:00.000Z` });

    expect(countOpenBetween([done], TOMORROW, '2026-08-25')).toBe(0);
  });
});

describe('countOpenByDate', () => {
  it('counts open tasks per day', () => {
    const counts = countOpenByDate([
      makeTask({ scheduled_date: TODAY }),
      makeTask({ scheduled_date: TODAY }),
      makeTask({ scheduled_date: TOMORROW }),
    ]);

    expect(counts.get(TODAY)).toBe(2);
    expect(counts.get(TOMORROW)).toBe(1);
  });

  it('leaves a day off entirely when everything on it is done', () => {
    // The calendar renders a missing key differently from a zero.
    const counts = countOpenByDate([
      makeTask({ scheduled_date: TODAY, completed_at: `${TODAY}T10:00:00.000Z` }),
    ]);

    expect(counts.has(TODAY)).toBe(false);
  });
});

describe('mergeTasksById', () => {
  it('keeps rows the incoming page does not mention', () => {
    const held = makeTask({ id: 'held' });
    const fresh = makeTask({ id: 'fresh' });

    expect(mergeTasksById([held], [fresh]).map((t) => t.id)).toEqual(['held', 'fresh']);
  });

  it('lets the incoming row win a collision, because it is the fresher read', () => {
    const stale = makeTask({ id: 'a', text: 'stale' });
    const fresh = makeTask({ id: 'a', text: 'fresh' });

    expect(mergeTasksById([stale], [fresh])).toEqual([fresh]);
  });
});

describe('mergeSnapshots', () => {
  it('merges on date and keeps the result in date order', () => {
    const current: DaySnapshot[] = [makeSnapshot({ date: '2026-08-10', completed_count: 1 })];
    const incoming: DaySnapshot[] = [
      makeSnapshot({ date: '2026-08-12' }),
      makeSnapshot({ date: '2026-08-11' }),
    ];

    expect(mergeSnapshots(current, incoming).map((s) => s.date)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
    ]);
  });

  it('replaces a day that is read again', () => {
    const before = makeSnapshot({ date: YESTERDAY, completed_count: 1 });
    const after = makeSnapshot({ date: YESTERDAY, completed_count: 4 });

    expect(mergeSnapshots([before], [after])).toEqual([after]);
  });
});

describe('resolveScheduling', () => {
  const parsed: Scheduling = { scheduled_date: TOMORROW, reminder_at: `${TOMORROW}T02:00:00.000Z` };

  it('falls back to the parsed day when the picker was never opened', () => {
    expect(resolveScheduling(parsed, null)).toEqual(parsed);
  });

  it('lets the picker override the day the text parsed to', () => {
    const picked: Scheduling = { scheduled_date: '2026-08-25', reminder_at: null };

    expect(resolveScheduling(parsed, picked).scheduled_date).toBe('2026-08-25');
  });

  it('treats a picked day with no time as clearing the reminder, not keeping the typed one', () => {
    // The asymmetry the function exists for: the date falls back, the reminder
    // does not. A picked day must never inherit a time left behind on the day
    // that was typed, and the picker is the only control that can clear one.
    const picked: Scheduling = { scheduled_date: '2026-08-25', reminder_at: null };

    expect(resolveScheduling(parsed, picked).reminder_at).toBeNull();
  });

  it('carries the picked reminder with the picked day', () => {
    const picked: Scheduling = {
      scheduled_date: '2026-08-25',
      reminder_at: '2026-08-25T09:00:00.000Z',
    };

    expect(resolveScheduling(parsed, picked)).toEqual(picked);
  });
});

describe('fieldsOf', () => {
  it('captures the current value of exactly the fields the patch will change', () => {
    const task = makeTask({ text: 'call physio', energy: 'quick', reschedule_count: 2 });

    expect(fieldsOf(task, { text: 'call doctor', energy: 'deep' })).toEqual({
      text: 'call physio',
      energy: 'quick',
    });
  });

  it('captures a null as a null rather than dropping the key', () => {
    // The rollback is spread over the task, so a missing key would leave the
    // optimistic value in place instead of undoing it.
    const before = fieldsOf(makeTask({ completed_at: null }), { completed_at: 'x' });

    expect('completed_at' in before).toBe(true);
    expect(before.completed_at).toBeNull();
  });

  it('is empty for an empty patch', () => {
    expect(fieldsOf(makeTask(), {})).toEqual({});
  });
});

describe('rolledCount', () => {
  it('reads the count out of the one-row set the RPC returns', () => {
    expect(rolledCount([{ rolled_count: 3 }])).toBe(3);
  });

  it('reads anything else as zero rather than throwing', () => {
    // A wrong count is a cosmetic toast; the rollover has already happened.
    expect(rolledCount(null)).toBe(0);
    expect(rolledCount([])).toBe(0);
    expect(rolledCount([{ other: 3 }])).toBe(0);
    expect(rolledCount([{ rolled_count: '3' }])).toBe(0);
    expect(rolledCount({ rolled_count: 3 })).toBe(0);
  });
});

describe('the helpers as the store composes them', () => {
  it('narrows a day to the visible list the way the store does', () => {
    const work = makeCategory({ id: 'cat-work', slug: 'work' });
    const tasks = [
      makeTask({ scheduled_date: TODAY, energy: 'quick', category_id: work.id }),
      makeTask({ scheduled_date: TODAY, energy: 'deep', category_id: work.id }),
      makeTask({ scheduled_date: TOMORROW, energy: 'quick', category_id: work.id }),
    ];

    const visible = filterTasks(tasksForDay(tasks, TODAY), 'quick', work.id);

    expect(visible).toHaveLength(1);
    expect(visible[0].scheduled_date).toBe(TODAY);
  });
});
