/**
 * Exercises the shared domain module — run it with `node domain.test.mjs`
 * (Node 22+, which strips the types on import). Run it under `TZ=UTC` too:
 * that is the Edge Function's zone, and the case the zoned parsing exists for.
 *
 *   node domain.test.mjs && TZ=UTC node domain.test.mjs
 */
import { parseCapture } from './parse-capture.ts';
import { todayIn, wallClock, wallToInstant, isValidTimeZone } from './zone.ts';
import { isIsoDate, toLocalDate } from './dates.ts';
import {
  newTask,
  editPatch,
  completePatch,
  reopenPatch,
  reschedulePatch,
  categoryFromSlug,
  normaliseNotes,
  resolveScheduling,
} from './task-rules.ts';
import { topBy, completedPerDay } from './review.ts';

const SYD = 'Australia/Sydney';
let failed = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? 'pass' : 'FAIL'}  ${name.padEnd(46)} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
};

// --- zone ------------------------------------------------------------------
check('late evening is still today', todayIn(SYD, new Date('2026-10-06T12:21:00Z')), '2026-10-06');
check(
  'half past midnight is tomorrow',
  todayIn(SYD, new Date('2026-10-06T13:30:00Z')),
  '2026-10-07',
);
check('before DST: UTC+10', todayIn(SYD, new Date('2026-10-03T13:59:00Z')), '2026-10-03');
check('before DST: UTC+10, midnight', todayIn(SYD, new Date('2026-10-03T14:00:00Z')), '2026-10-04');
check(
  'wall clock reads local fields',
  toLocalDate(wallClock(new Date('2026-10-06T21:00:00Z'), SYD)),
  '2026-10-07',
);
check('wall clock hour', wallClock(new Date('2026-10-06T21:00:00Z'), SYD).getHours(), 8);
check('valid zone', isValidTimeZone(SYD), true);
check('invalid zone', isValidTimeZone('Not/AZone'), false);

// Round trips: wall → instant → wall, either side of the change.
for (const iso of ['2026-10-03T00:00:00Z', '2026-10-05T03:00:00Z', '2026-07-01T23:15:00Z']) {
  const back = wallToInstant(wallClock(new Date(iso), SYD), SYD).toISOString();
  check(`round trip ${iso}`, back, new Date(iso).toISOString());
}

// The spring-forward gap only exists as a wall Date in a runtime without DST.
if (new Date(2026, 9, 4, 2, 30).getHours() === 2) {
  check(
    'gap time resolves an hour on',
    wallToInstant(new Date(2026, 9, 4, 2, 30), SYD).toISOString(),
    '2026-10-03T16:30:00.000Z',
  );
}

// --- parseCapture with a zone ----------------------------------------------
// 8am Wednesday in Sydney is 9pm Tuesday in UTC. A UTC reading would put
// "tomorrow" on Wednesday.
{
  const r = parseCapture(
    'call physio tomorrow 9am #health !quick',
    new Date('2026-10-06T21:00:00Z'),
    SYD,
  );
  check('zoned: text', r.text, 'call physio');
  check('zoned: tomorrow is Sydney tomorrow', r.scheduled_date, '2026-10-08');
  check('zoned: 9am Sydney as an instant', r.reminder_at, '2026-10-07T22:00:00.000Z');
  check('zoned: category', r.categorySlug, 'health');
  check('zoned: energy', r.energy, 'quick');
}
{
  const r = parseCapture('take the bins out', new Date('2026-10-06T21:00:00Z'), SYD);
  check('zoned: no date is Sydney today', r.scheduled_date, '2026-10-07');
  check('zoned: no date, no reminder', r.reminder_at, null);
}
// Typed on the Saturday before the change (AEST), for the Monday after (AEDT).
{
  const r = parseCapture('dentist monday 2pm', new Date('2026-10-03T00:00:00Z'), SYD);
  check('across DST: day', r.scheduled_date, '2026-10-05');
  check('across DST: 2pm AEDT', r.reminder_at, '2026-10-05T03:00:00.000Z');
}
{
  const r = parseCapture('check the alarm sunday 1am', new Date('2026-10-03T00:00:00Z'), SYD);
  check('across DST: 1am AEST still', r.reminder_at, '2026-10-03T15:00:00.000Z');
}
// With no zone it is the runtime's, as it always was in the browser.
{
  const ref = new Date(2026, 7, 17, 9, 0, 0);
  const r = parseCapture('call physio thursday 2pm', ref);
  check('unzoned: local Thursday', r.scheduled_date, '2026-08-20');
  check('unzoned: local 2pm', new Date(r.reminder_at).getHours(), 14);
}

// --- task rules ------------------------------------------------------------
const base = {
  id: 't1',
  user_id: 'u1',
  text: 'call physio',
  created_date: '2026-10-01',
  scheduled_date: '2026-10-07',
  completed_at: null,
  energy: null,
  category_id: null,
  reminder_at: null,
  notes: null,
  carried_over_count: 2,
  reschedule_count: 1,
  created_at: '2026-10-01T00:00:00.000Z',
};
const parsedOn = (date) => ({
  text: 'call physio',
  scheduled_date: date,
  reminder_at: null,
  categorySlug: null,
  energy: 'quick',
  tokens: [],
});

{
  const t = newTask({
    id: 'n1',
    userId: 'u1',
    parsed: parsedOn('2026-10-09'),
    scheduling: null,
    categoryId: 'c1',
    notes: null,
    today: '2026-10-07',
    now: new Date('2026-10-06T21:00:00Z'),
  });
  check('new: counters start at zero', [t.carried_over_count, t.reschedule_count], [0, 0]);
  check('new: created_date is the user today', t.created_date, '2026-10-07');
  check('new: parsed day', t.scheduled_date, '2026-10-09');
  check('new: open', t.completed_at, null);
}
check(
  'new: picker overrides parsed day',
  resolveScheduling(parsedOn('2026-10-09'), { scheduled_date: '2026-10-12', reminder_at: null }),
  { scheduled_date: '2026-10-12', reminder_at: null },
);
check(
  'edit forward counts',
  editPatch(base, parsedOn('2026-10-09'), null, null, null).reschedule_count,
  2,
);
check(
  'edit backward does not',
  'reschedule_count' in editPatch(base, parsedOn('2026-10-06'), null, null, null),
  false,
);
check(
  'edit same day does not',
  'reschedule_count' in editPatch(base, parsedOn('2026-10-07'), null, null, null),
  false,
);
check(
  'edit never touches carried',
  'carried_over_count' in editPatch(base, parsedOn('2026-10-20'), null, null, null),
  false,
);
check('reschedule counts', reschedulePatch(base, '2026-10-10'), {
  scheduled_date: '2026-10-10',
  reschedule_count: 2,
});
check('reschedule back still counts', reschedulePatch(base, '2026-10-01').reschedule_count, 2);
check('complete pins the day', completePatch(new Date('2026-10-06T21:00:00Z'), '2026-10-07'), {
  completed_at: '2026-10-06T21:00:00.000Z',
  scheduled_date: '2026-10-07',
});
check('reopen clears only completed_at', reopenPatch(), { completed_at: null });
check('category from slug', categoryFromSlug('health', 4), {
  slug: 'health',
  name: 'Health',
  sort_order: 4,
});
check('notes: blank is null', normaliseNotes('   '), null);
check('notes: trimmed', normaliseNotes('  bring referral '), 'bring referral');
check('notes: undefined is null', normaliseNotes(undefined), null);

// --- dates -----------------------------------------------------------------
check('iso date ok', isIsoDate('2026-10-07'), true);
check('iso date impossible', isIsoDate('2026-02-30'), false);
check('iso date shape', isIsoDate('7/10/2026'), false);

// --- review ----------------------------------------------------------------
const many = [
  { ...base, id: 'a', carried_over_count: 1 },
  { ...base, id: 'b', carried_over_count: 5 },
  { ...base, id: 'c', carried_over_count: 9, completed_at: '2026-10-06T00:00:00Z' },
  { ...base, id: 'd', carried_over_count: 0 },
  { ...base, id: 'e', carried_over_count: 3 },
];
check(
  'top carried: open only, by count',
  topBy(many, 'carried_over_count', 2).map((t) => t.id),
  ['b', 'e'],
);
check(
  'completed per day',
  completedPerDay(
    [
      {
        user_id: 'u1',
        date: '2026-10-05',
        completed_count: 3,
        carried_count: 0,
        carried_task_ids: [],
      },
    ],
    '2026-10-04',
    '2026-10-06',
    '2026-10-06',
    2,
  ),
  [
    { date: '2026-10-04', completed: 0, unrecorded: true },
    { date: '2026-10-05', completed: 3, unrecorded: false },
    { date: '2026-10-06', completed: 2, unrecorded: false },
  ],
);

console.log(failed === 0 ? `\nall passed` : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
