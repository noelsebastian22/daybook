-- ============================================================
-- Tests for 0009_scheduled_rollover.sql, against a local stack.
--
--   supabase start
--   docker exec -i supabase_db_daybook psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/scheduled_rollover.test.sql
--
-- Runs inside one transaction and rolls back, so it leaves nothing behind.
-- Prints "scheduled rollover: all passed" or stops at the first failure.
--
-- Every date is computed from each user's own local today at run time, so
-- the file passes on any day and in any zone the machine happens to be in.
-- ============================================================

begin;

-- A Sydney: two stale open tasks, one done yesterday, one future, one today
-- B Sydney: finished everything, no snapshots yet — due for history only
-- C Kiritimati (UTC+14) and D Pago Pago (UTC-11): the same scheduled date,
--   which is D's today and already past for C. Midnight is per user.
-- G Pago Pago with a task from its own yesterday. Before 10:00 UTC the UTC
--   date is a day AHEAD of Pago Pago and equal to Kiritimati's, so C alone
--   cannot tell a UTC rollover from a local one at that hour; G can. After
--   11:00 UTC it is the other way round. Between them, every hour is covered.
-- E a zone Postgres cannot read, set behind the validating trigger's back
-- F only has tasks for today — not due
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'd@test.local'),
  ('00000000-0000-0000-0000-00000000000e', 'e@test.local'),
  ('00000000-0000-0000-0000-00000000000f', 'f@test.local'),
  ('00000000-0000-0000-0000-000000000006', 'g@test.local');

insert into user_settings (user_id, timezone) values
  ('00000000-0000-0000-0000-00000000000a', 'Australia/Sydney'),
  ('00000000-0000-0000-0000-00000000000b', 'Australia/Sydney'),
  ('00000000-0000-0000-0000-00000000000c', 'Pacific/Kiritimati'),
  ('00000000-0000-0000-0000-00000000000d', 'Pacific/Pago_Pago'),
  ('00000000-0000-0000-0000-00000000000e', 'Australia/Sydney'),
  ('00000000-0000-0000-0000-00000000000f', 'Australia/Sydney'),
  ('00000000-0000-0000-0000-000000000006', 'Pacific/Pago_Pago');

alter table user_settings disable trigger user_settings_validate_timezone;
update user_settings set timezone = 'Mars/Olympus_Mons'
 where user_id = '00000000-0000-0000-0000-00000000000e';
alter table user_settings enable trigger user_settings_validate_timezone;

create temp table local_day as
select us.user_id, (now() at time zone coalesce(nullif(us.timezone, 'Mars/Olympus_Mons'), 'utc'))::date as d
from user_settings us;

insert into tasks (id, user_id, text, created_date, scheduled_date, completed_at)
select v.id::uuid, v.uid::uuid, v.text, l.d + v.off, l.d + v.off, v.done
from (values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'a stale 3', -3, null::timestamptz),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'a stale 1', -1, null),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'a done 1',  -1, now() - interval '1 day'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'a future',   2, null),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'a today',    0, null),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000b', 'b done 2',  -2, now() - interval '2 days'),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-00000000000e', 'e stale 5', -5, null),
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000f', 'f today',    0, null),
  ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000006', 'g stale 1', -1, null)
) as v(id, uid, text, off, done)
join local_day l on l.user_id = v.uid::uuid;

-- C and D both get D's today
insert into tasks (id, user_id, text, created_date, scheduled_date)
select v.id::uuid, v.uid::uuid, v.text, l.d, l.d
from (values
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'c on pago day'),
  ('10000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'd on pago day')
) as v(id, uid, text)
join local_day l on l.user_id = '00000000-0000-0000-0000-00000000000d';


-- ---------- the first cron tick ----------
create temp table first_run as select * from rollover_due_users();

do $$
declare
  r        record;
  a_today  date := (select d from local_day where user_id = '00000000-0000-0000-0000-00000000000a');
  b_today  date := (select d from local_day where user_id = '00000000-0000-0000-0000-00000000000b');
  c_today  date := (select d from local_day where user_id = '00000000-0000-0000-0000-00000000000c');
  d_today  date := (select d from local_day where user_id = '00000000-0000-0000-0000-00000000000d');
  g_today  date := (select d from local_day where user_id = '00000000-0000-0000-0000-000000000006');
  c_gap    int  := c_today - d_today;
  t        record;
  s        record;
begin
  assert c_gap between 1 and 2, format('fixture: Kiritimati should be 1-2 days ahead of Pago Pago, got %s', c_gap);

  select * into r from first_run;
  assert r.users_rolled = 4,
    format('users_rolled: expected 4 (A, B, C, G), got %s', r.users_rolled);
  assert r.tasks_rolled = 4,
    format('tasks_rolled: expected 4 (A x2, C, G), got %s', r.tasks_rolled);
  -- A: today-3 .. today-1 = 3; B: today-2 .. today-1 = 2; C: one per day of
  -- gap; G: yesterday = 1
  assert r.days_snapshotted = 6 + c_gap,
    format('days_snapshotted: expected %s, got %s', 6 + c_gap, r.days_snapshotted);

  -- A: carried by days slipped, not by 1
  select * into t from tasks where id = '10000000-0000-0000-0000-000000000001';
  assert t.scheduled_date = a_today and t.carried_over_count = 3,
    format('a stale 3: expected %s / 3, got %s / %s', a_today, t.scheduled_date, t.carried_over_count);
  select * into t from tasks where id = '10000000-0000-0000-0000-000000000002';
  assert t.scheduled_date = a_today and t.carried_over_count = 1,
    format('a stale 1: expected %s / 1, got %s / %s', a_today, t.scheduled_date, t.carried_over_count);

  -- A: done, future and today's tasks do not move
  select * into t from tasks where id = '10000000-0000-0000-0000-000000000003';
  assert t.scheduled_date = a_today - 1 and t.carried_over_count = 0, 'a done 1 moved';
  select * into t from tasks where id = '10000000-0000-0000-0000-000000000004';
  assert t.scheduled_date = a_today + 2 and t.carried_over_count = 0, 'a future moved';
  select * into t from tasks where id = '10000000-0000-0000-0000-000000000005';
  assert t.scheduled_date = a_today and t.carried_over_count = 0, 'a today moved';

  -- A: yesterday's snapshot is the day as it closed
  select * into s from day_snapshots
   where user_id = '00000000-0000-0000-0000-00000000000a' and date = a_today - 1;
  assert s.completed_count = 1 and s.carried_count = 2,
    format('a yesterday snapshot: expected 1 done / 2 carried, got %s / %s', s.completed_count, s.carried_count);
  assert not exists (select 1 from day_snapshots
                      where user_id = '00000000-0000-0000-0000-00000000000a' and date >= a_today),
    'a: today was snapshotted while still running';

  -- B: history written at midnight with nothing to carry
  assert (select count(*) from day_snapshots where user_id = '00000000-0000-0000-0000-00000000000b') = 2,
    'b: expected two snapshot rows';
  select * into s from day_snapshots
   where user_id = '00000000-0000-0000-0000-00000000000b' and date = b_today - 2;
  assert s.completed_count = 1 and s.carried_count = 0, 'b: wrong counts on the day it finished';

  -- C rolled to its own today; D, same date, did not move
  select * into t from tasks where id = '10000000-0000-0000-0000-00000000000c';
  assert t.scheduled_date = c_today and t.carried_over_count = c_gap,
    format('c: expected %s / %s, got %s / %s', c_today, c_gap, t.scheduled_date, t.carried_over_count);
  select * into t from tasks where id = '10000000-0000-0000-0000-00000000000d';
  assert t.scheduled_date = d_today and t.carried_over_count = 0, 'd: rolled before its own midnight';

  -- G lands on its own today, never on a tomorrow borrowed from UTC
  select * into t from tasks where id = '10000000-0000-0000-0000-000000000010';
  assert t.scheduled_date = g_today and t.carried_over_count = 1,
    format('g: expected %s / 1, got %s / %s', g_today, t.scheduled_date, t.carried_over_count);

  -- E skipped, F untouched
  select * into t from tasks where id = '10000000-0000-0000-0000-000000000008';
  assert t.carried_over_count = 0, 'e: unreadable zone was rolled by the cron';
  assert not exists (select 1 from day_snapshots where user_id = '00000000-0000-0000-0000-00000000000f'),
    'f: snapshotted with nothing closed';
end $$;


-- ---------- every later tick is a no-op ----------
do $$
declare
  r record;
begin
  select * into r from rollover_due_users();
  assert r.users_rolled = 0 and r.tasks_rolled = 0 and r.days_snapshotted = 0,
    format('second tick: expected 0/0/0, got %s/%s/%s', r.users_rolled, r.tasks_rolled, r.days_snapshotted);
end $$;


-- ---------- the app's path still works, through the wrapper ----------
-- E, whom the cron skipped, opens the app. Falls back to UTC as before.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}';

do $$
declare
  r     record;
  utc_d date := (now() at time zone 'utc')::date;
begin
  select * into r from rollover_and_snapshot(utc_d);
  assert r.rolled_count = 1,
    format('wrapper: expected 1 rolled for e, got %s', r.rolled_count);
end $$;


reset role;


-- ---------- nobody signed in can reach the other two ----------
-- Checked as grants, not by calling as the role and catching 42501: an
-- invoker function that IS executable still raises 42501 from inside its
-- body on the first table RLS or a missing grant refuses, which reads as a
-- pass. That mutant was tried and slipped through.
do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    assert not has_function_privilege(role_name, 'public.daybook_rollover_user(uuid, date)', 'execute'),
      format('%s can execute daybook_rollover_user', role_name);
    assert not has_function_privilege(role_name, 'public.rollover_due_users()', 'execute'),
      format('%s can execute rollover_due_users', role_name);
  end loop;

  assert not has_function_privilege('anon', 'public.rollover_and_snapshot(date)', 'execute'),
    'anon can execute rollover_and_snapshot';
  assert has_function_privilege('authenticated', 'public.rollover_and_snapshot(date)', 'execute'),
    'authenticated lost rollover_and_snapshot';
  assert has_function_privilege('service_role', 'public.rollover_due_users()', 'execute'),
    'service_role cannot execute rollover_due_users';
end $$;


-- ---------- the schedule exists ----------
do $$
begin
  assert exists (
    select 1 from cron.job
     where jobname  = 'daybook-rollover'
       and schedule = '*/15 * * * *'
       and command  = 'select public.rollover_due_users()'
       and active
  ), 'cron job daybook-rollover missing or wrong';
end $$;

select 'scheduled rollover: all passed' as result;

rollback;
