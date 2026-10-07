/**
 * Exercises the real helpers from core.ts — run it with `node core.test.mjs`
 * (Node 22+, which strips the types on import). Same arrangement as
 * access/core.test.mjs: index.ts calls Deno.serve at load, so it is not
 * importable here; tools.test.ts covers the wiring under Deno.
 */
import {
  checkRange,
  clockIn,
  dayLabel,
  lineOf,
  matchesQuery,
  normaliseSlug,
  parseClock,
  sortForDay,
  viewOf,
} from './core.ts';

let failed = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? 'pass' : 'FAIL'}  ${name.padEnd(40)} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
};

const SYD = 'Australia/Sydney';
const task = {
  id: 'abc',
  user_id: 'u1',
  text: 'call physio',
  created_date: '2026-10-01',
  scheduled_date: '2026-10-08',
  completed_at: null,
  energy: 'quick',
  category_id: 'c1',
  reminder_at: '2026-10-08T03:00:00.000Z',
  notes: 'bring the referral',
  carried_over_count: 2,
  reschedule_count: 0,
  created_at: '2026-10-01T00:00:00.000Z',
};
const cats = new Map([['c1', { id: 'c1', slug: 'health', name: 'Health' }]]);
const view = viewOf(task, cats);

check('view: category as slug', view.category, 'health');
check('view: counters renamed', [view.carried, view.pushed], [2, 0]);
check(
  'view: unknown category is null',
  viewOf({ ...task, category_id: 'zz' }, cats).category,
  null,
);

check('day: today', dayLabel('2026-10-07', '2026-10-07'), 'today');
check('day: tomorrow', dayLabel('2026-10-08', '2026-10-07'), 'tomorrow');
check('day: yesterday', dayLabel('2026-10-06', '2026-10-07'), 'yesterday');
check('day: otherwise weekday and date', dayLabel('2026-10-12', '2026-10-07'), 'Mon 12 Oct');

check('clock on the user clock', clockIn('2026-10-08T03:00:00.000Z', SYD), '14:00');
check(
  'line: everything a model needs',
  lineOf(view, SYD, '2026-10-07', true),
  '- call physio · tomorrow · 14:00 · #health · quick · carried ×2 · has notes (id abc)',
);
check(
  'line: done shows when',
  lineOf(
    { ...view, done_at: '2026-10-07T22:15:00.000Z', category: null, notes: null, carried: 0 },
    SYD,
    '2026-10-08',
  ),
  '- call physio · done 09:15 · quick (id abc)',
);

const a = { ...view, id: 'a', done_at: null };
const b = { ...view, id: 'b', done_at: '2026-10-07T01:00:00Z' };
const c = { ...view, id: 'c', done_at: '2026-10-07T00:00:00Z' };
check(
  'sort: open first, done by time',
  [b, a, c].sort(sortForDay).map((v) => v.id),
  ['a', 'c', 'b'],
);

check('query: every word, any case', matchesQuery(task, 'Physio REFERRAL'), true);
check('query: a missing word fails', matchesQuery(task, 'physio dentist'), false);
check('query: blank matches', matchesQuery(task, '  '), true);

check('range: ok', checkRange('2026-10-01', '2026-10-14', 92), {
  from: '2026-10-01',
  to: '2026-10-14',
});
check('range: backwards', 'error' in checkRange('2026-10-14', '2026-10-01', 92), true);
check('range: exactly the cap', 'error' in checkRange('2026-10-01', '2026-10-07', 7), false);
check('range: over the cap', 'error' in checkRange('2026-10-01', '2026-10-08', 7), true);
check('range: bad date', 'error' in checkRange('2026-13-01', '2026-10-08', 7), true);

check('clock: ok', parseClock('14:05'), { h: 14, m: 5 });
check('clock: single digit hour', parseClock('9:30'), { h: 9, m: 30 });
check('clock: 24:00 is not a time', parseClock('24:00'), null);
check('clock: am/pm is not accepted', parseClock('2pm'), null);

check('slug: strips #, lowercases', normaliseSlug('#Health'), 'health');
check('slug: unicode', normaliseSlug('café'), 'café');
check('slug: spaces refused', normaliseSlug('two words'), null);

console.log(failed === 0 ? `\nall passed` : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
