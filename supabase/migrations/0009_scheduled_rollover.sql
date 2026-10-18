-- ============================================================
-- Daybook: rollover at each user's own midnight, not on app open.
--
-- Until now rollover ran only when something called rollover_and_snapshot:
-- the app on open, or the MCP server before a tool that touches tasks. A day
-- nobody opened the app was a day nothing moved. Yesterday's open tasks sat
-- on yesterday, the 7am digest listed today's tasks without them, and the
-- day's snapshot waited for whenever the app was next opened. On 18 Oct one
-- live account had eleven open tasks dated before its own today.
--
-- Three pieces:
--
--   1. daybook_rollover_user(uid, today) — the body of rollover_and_snapshot,
--      unchanged, with the user passed in instead of read from auth.uid().
--      The one place that moves carried_over_count.
--   2. rollover_and_snapshot(p_today) — now a thin wrapper over it for a
--      signed-in user. Same signature, same result, so the app and the MCP
--      server need no change, and the app's call on open stays as a
--      backstop: it is idempotent and still covers a device a day ahead of
--      the stored zone after travelling east.
--   3. rollover_due_users() — the cron's entry point. Every user whose OWN
--      local date has moved past an open task, or past an unsnapshotted day,
--      gets rolled to their local today.
--
-- The schedule is every 15 minutes, not daily at midnight. The cron runs in
-- UTC, and UTC midnight is 10 or 11am in Sydney. Every 15 minutes lands on
-- local midnight in every zone, the :30 and :45 ones included, and the
-- filter makes every other tick a no-op for everyone.
--
-- carried_over_count still increments by days slipped, so the number is the
-- same whether the cron moves a task at midnight or the app moves it a week
-- later. The cron just makes the second case rare.
--
-- Unlike daybook-notify this schedule carries no key: pg_cron runs SQL as
-- postgres and there is no HTTP hop. So, unlike that one, it is a migration.
-- ============================================================


-- ---------- 1. the rollover itself, for one user ----------
-- Not SECURITY DEFINER and revoked from everyone below: it takes any uid,
-- so a signed-in user reaching it directly could roll somebody else's list.
-- Both callers are definer functions owned by postgres, which is all that
-- needs to execute it.
create or replace function daybook_rollover_user(p_uid uuid, p_today date)
returns table (rolled_count int, snapshots_written int)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_today     date;
  v_zone      text;
  v_local     date;
  v_start     date;
  v_last_snap date;
  v_min_task  date;
  v_day       date;
  v_bound     date;
  v_snaps     int := 0;
  v_rolled    int := 0;
begin
  if p_uid is null then
    raise exception 'no user';
  end if;

  -- The app on open and the cron at midnight can land on the same user in
  -- the same second. Either order is correct on its own; serialising them
  -- keeps the snapshot counts from being read halfway through the other's
  -- move.
  perform pg_advisory_xact_lock(hashtext('daybook_rollover'), hashtext(p_uid::text));

  -- Everything below is 0005's body, verbatim bar auth.uid() -> p_uid.

  select us.timezone into v_zone from user_settings us where us.user_id = p_uid;
  v_local := coalesce(daybook_local_now(v_zone), now() at time zone 'utc')::date;

  -- 1. clamp the given date against the user's local day, not UTC
  v_today := least(greatest(p_today, v_local - 1), v_local + 1);

  select max(date) into v_last_snap from day_snapshots where user_id = p_uid;
  select min(scheduled_date) into v_min_task from tasks where user_id = p_uid;

  if v_min_task is null then
    return query select 0, 0;
    return;
  end if;

  -- 2. snapshot every unrecorded day that has actually closed. The bound is
  --    v_local, never v_today: a client claiming tomorrow must not be able
  --    to seal today's counts while today is still being worked.
  v_start := coalesce(v_last_snap + 1, v_min_task);
  v_start := greatest(v_start, v_today - 400);  -- sanity bound
  v_bound := least(v_today, v_local);

  v_day := v_start;
  while v_day < v_bound loop
    insert into day_snapshots (user_id, date, completed_count, carried_count, carried_task_ids)
    select
      p_uid,
      v_day,
      coalesce(count(*) filter (where t.completed_at is not null and t.scheduled_date = v_day), 0)::int,
      coalesce(count(*) filter (where t.completed_at is null and t.scheduled_date <= v_day), 0)::int,
      coalesce(array_agg(t.id) filter (where t.completed_at is null and t.scheduled_date <= v_day), '{}')
    from tasks t
    where t.user_id = p_uid
      and (t.scheduled_date = v_day or (t.completed_at is null and t.scheduled_date <= v_day))
    on conflict (user_id, date) do nothing;

    if found then
      v_snaps := v_snaps + 1;
    end if;

    v_day := v_day + 1;
  end loop;

  -- 3. roll open, past-dated tasks forward. Future-dated tasks are never
  --    matched: they sit and wait.
  with moved as (
    update tasks
       set carried_over_count = carried_over_count + (v_today - scheduled_date),
           scheduled_date     = v_today
     where user_id = p_uid
       and completed_at is null
       and scheduled_date < v_today
    returning 1
  )
  select count(*)::int into v_rolled from moved;

  return query select v_rolled, v_snaps;
end;
$$;

revoke execute on function daybook_rollover_user(uuid, date) from anon, authenticated, public;


-- ---------- 2. the signed-in entry point, now a wrapper ----------
create or replace function rollover_and_snapshot(p_today date)
returns table (rolled_count int, snapshots_written int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  return query select * from daybook_rollover_user(v_uid, p_today);
end;
$$;

revoke execute on function rollover_and_snapshot(date) from anon, public;
grant  execute on function rollover_and_snapshot(date) to authenticated;


-- ---------- 3. the cron's entry point ----------
-- Called by pg_cron, so auth.uid() is null by definition: no guard, and
-- locked to service_role like the other cron functions (AGENTS.md).
--
-- A user is due when their own local date has passed an open task, or has
-- closed a day with no snapshot. The second clause is what writes a day's
-- history at midnight for someone who finished everything. A zone
-- daybook_local_now cannot read is skipped rather than guessed at; the app
-- still rolls that user on open, falling back to UTC as before.
--
-- One user failing does not stop the rest: each runs in its own
-- subtransaction and a failure is logged as a warning.
create or replace function rollover_due_users()
returns table (users_rolled int, tasks_rolled int, days_snapshotted int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        record;
  v_rolled int;
  v_snaps  int;
  v_users  int := 0;
  v_tasks  int := 0;
  v_days   int := 0;
begin
  for r in
    select us.user_id, ln.local::date as local_date
    from user_settings us
    -- offset 0 fences the lateral, as in due_digests: one zone conversion
    -- per row instead of one per reference.
    cross join lateral (select daybook_local_now(us.timezone) as local offset 0) ln
    where ln.local is not null
      and (
        exists (
          select 1 from tasks t
          where t.user_id = us.user_id
            and t.completed_at is null
            and t.scheduled_date < ln.local::date
        )
        or (
          exists (
            select 1 from tasks t
            where t.user_id = us.user_id
              and t.scheduled_date < ln.local::date
          )
          and not exists (
            select 1 from day_snapshots s
            where s.user_id = us.user_id
              and s.date >= ln.local::date - 1
          )
        )
      )
  loop
    begin
      select f.rolled_count, f.snapshots_written
        into v_rolled, v_snaps
        from daybook_rollover_user(r.user_id, r.local_date) f;

      v_users := v_users + 1;
      v_tasks := v_tasks + v_rolled;
      v_days  := v_days + v_snaps;
    exception when others then
      raise warning 'daybook rollover failed for %: % (%)', r.user_id, sqlerrm, sqlstate;
    end;
  end loop;

  return query select v_users, v_tasks, v_days;
end;
$$;

revoke execute on function rollover_due_users() from anon, authenticated, public;
grant  execute on function rollover_due_users() to service_role;


-- ---------- 4. the schedule ----------
-- cron.schedule upserts by name, so re-running this is harmless.
-- To check on it:
--   select * from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'daybook-rollover')
--    order by start_time desc limit 20;
-- To stop it:
--   select cron.unschedule('daybook-rollover');
select cron.schedule(
  'daybook-rollover',
  '*/15 * * * *',
  $$select public.rollover_due_users()$$
);
