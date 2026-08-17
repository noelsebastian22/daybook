-- ============================================================
-- ensure_user_setup()
-- Idempotent. Creates user_settings and the default categories on first
-- login. Called by the client whenever a session resolves.
--
-- Deliberately not a trigger on auth.users: triggers on that table fail in
-- ways that are painful to debug and can block sign-up entirely.
-- ============================================================
create or replace function ensure_user_setup(p_timezone text default 'Australia/Sydney')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into user_settings (user_id, timezone)
  values (v_uid, coalesce(p_timezone, 'Australia/Sydney'))
  on conflict (user_id) do nothing;

  if not exists (select 1 from user_settings where user_id = v_uid and seeded_at is not null) then
    insert into categories (user_id, name, slug, colour, sort_order) values
      (v_uid, 'Freelance', 'freelance', '#f97316', 0),
      (v_uid, 'Work',      'work',      '#3b82f6', 1),
      (v_uid, 'Family',    'family',    '#a855f7', 2),
      (v_uid, 'Health',    'health',    '#10b981', 3)
    on conflict (user_id, slug) do nothing;

    update user_settings set seeded_at = now() where user_id = v_uid;
  end if;
end;
$$;

-- ============================================================
-- rollover_and_snapshot(p_today date)
-- Lazy rollover. Runs on app open with the CLIENT's local date, not on a
-- cron. Timezone-correct by construction and idempotent, so it does not
-- matter how often it runs.
--
-- 1. Clamps p_today to within a day of server time, so a wrong device
--    clock cannot scramble history.
-- 2. Writes a day_snapshots row for EVERY un-snapshotted day in the gap,
--    not just the closing day. Skip a weekend and Fri/Sat/Sun must each
--    keep their own row, otherwise the heat map loses two days.
-- 3. Only then rolls open past-dated tasks forward.
--
-- carried_over_count increments by the number of DAYS the task failed to
-- get done, not by 1 per run. Counting runs would make the number depend
-- on how often the app is opened: a task ignored for a week would read as
-- 1 if you open the app once and 7 if you open it daily. Same avoidance,
-- different number, useless insight.
-- ============================================================
create or replace function rollover_and_snapshot(p_today date)
returns table (rolled_count int, snapshots_written int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_today     date;
  v_server    date := (now() at time zone 'utc')::date;
  v_start     date;
  v_last_snap date;
  v_min_task  date;
  v_day       date;
  v_snaps     int := 0;
  v_rolled    int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- 1. clamp the client date to server time +/- 1 day
  v_today := least(greatest(p_today, v_server - 1), v_server + 1);

  select max(date) into v_last_snap from day_snapshots where user_id = v_uid;
  select min(scheduled_date) into v_min_task from tasks where user_id = v_uid;

  if v_min_task is null then
    return query select 0, 0;
    return;
  end if;

  -- 2. snapshot every unrecorded day up to (but excluding) today
  v_start := coalesce(v_last_snap + 1, v_min_task);
  v_start := greatest(v_start, v_today - 400);  -- sanity bound

  v_day := v_start;
  while v_day < v_today loop
    insert into day_snapshots (user_id, date, completed_count, carried_count, carried_task_ids)
    select
      v_uid,
      v_day,
      coalesce(count(*) filter (where t.completed_at is not null and t.scheduled_date = v_day), 0)::int,
      coalesce(count(*) filter (where t.completed_at is null and t.scheduled_date <= v_day), 0)::int,
      coalesce(array_agg(t.id) filter (where t.completed_at is null and t.scheduled_date <= v_day), '{}')
    from tasks t
    where t.user_id = v_uid
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
     where user_id = v_uid
       and completed_at is null
       and scheduled_date < v_today
    returning 1
  )
  select count(*)::int into v_rolled from moved;

  return query select v_rolled, v_snaps;
end;
$$;

-- Both functions bail on a null auth.uid(), but revoke anyway so the
-- Supabase security linter stays quiet and anon cannot even reach them.
revoke execute on function ensure_user_setup(text)     from anon, public;
revoke execute on function rollover_and_snapshot(date) from anon, public;
grant  execute on function ensure_user_setup(text)     to authenticated;
grant  execute on function rollover_and_snapshot(date) to authenticated;
