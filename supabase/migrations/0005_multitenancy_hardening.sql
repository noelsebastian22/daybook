-- ============================================================
-- Daybook: multi-tenancy hardening.
--
-- Comes out of the 3 Sep audit (BUILD-PLAN.md §4 Phase 7). The table layer
-- was already correct — RLS on all four tables, owner-only, with check on
-- every policy — so nothing here touches the isolation model. What is here
-- is everything that runs OUTSIDE RLS and was therefore never protected by
-- it: the cron's cross-user queries, the push subscription's true identity,
-- and the one place a client can write a value that breaks a shared job.
--
-- Ordered by blast radius, worst first.
-- ============================================================


-- ============================================================
-- 1. A bad timezone can no longer take the digest down for everyone.
--    (Phase 7, blocker 1 — the worst bug found on either side.)
--
-- user_settings.timezone is unvalidated text and any signed-in user can
-- PATCH their own row to anything. due_digests evaluates
-- `now() at time zone us.timezone` across ALL rows in ONE statement, so a
-- single unrecognised zone raises 22023 and aborts the whole query. Nobody
-- gets a digest, indefinitely, and the cron still records HTTP 200 because
-- the Edge Function swallows it — invisible from the outside.
--
-- It is not even an attack. The browser's Intl zone set is not Postgres's,
-- so ensure_user_setup(p_timezone := browserTimezone()) can plant one
-- through the happy path.
--
-- Defended at both ends, because either alone is insufficient: validation
-- on write cannot fix rows already stored, and a row valid today can stop
-- being valid when a Postgres upgrade ships a new OS tz database.
-- ============================================================

-- The only trustworthy test is to attempt the conversion. pg_timezone_names
-- is a scan over the OS tz database and does not list every spelling
-- Postgres will accept, so testing membership in it would reject valid
-- input. This returns rather than raises, which is what makes it safe to
-- put in a WHERE clause.
create or replace function daybook_is_valid_timezone(p_timezone text)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_timezone is null then
    return false;
  end if;
  -- A fixed instant, not now(): whether a zone name is recognised has
  -- nothing to do with the current time, and using now() here would make
  -- the function volatile in fact while labelled otherwise.
  --
  -- STABLE rather than IMMUTABLE, and the distinction is not pedantry: the
  -- set of recognised zones comes from the OS tz database and does change
  -- across a Postgres upgrade. IMMUTABLE would license the planner to cache
  -- a result that has since stopped being true.
  perform timestamptz '2000-01-01 00:00:00+00' at time zone p_timezone;
  return true;
exception when others then
  return false;
end;
$$;

-- The total version of `now() at time zone tz`: NULL instead of an
-- exception. This is the piece that actually makes due_digests safe, and
-- the reason it exists rather than an `and daybook_is_valid_timezone(...)`
-- guard in the WHERE clause is subtle and load-bearing:
--
--   SQL does not guarantee the evaluation order of AND operands. A planner
--   free to evaluate `(now() at time zone us.timezone)::time >= ...` before
--   the validity guard will still raise, and the guard will look like it
--   works right up until the day the plan changes.
--
-- Making the conversion itself total removes the ordering question
-- entirely: a bad row yields NULL, NULL fails every comparison, and the row
-- is simply not selected. No abort is reachable by any plan.
create or replace function daybook_local_now(p_timezone text)
returns timestamp
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  return now() at time zone p_timezone;
exception when others then
  return null;
end;
$$;

-- Write end. Rejects garbage at the source so the column stops accumulating
-- values the cron cannot read.
--
-- This raises rather than coercing on purpose: reaching here means either a
-- hand-crafted PATCH, or the Settings select offering a zone Postgres does
-- not know — both are bugs worth hearing about. The happy path is coerced
-- instead, inside ensure_user_setup below, so a browser reporting a zone
-- Postgres has never heard of still gets an account.
create or replace function daybook_validate_timezone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not daybook_is_valid_timezone(new.timezone) then
    raise exception 'invalid timezone: %', coalesce(new.timezone, '(null)')
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists user_settings_validate_timezone on user_settings;
create trigger user_settings_validate_timezone
  before insert or update of timezone on user_settings
  for each row execute function daybook_validate_timezone();

-- Repair whatever is already stored. The trigger only guards writes from
-- here on, so without this the read-end defence below would be carrying the
-- whole load and a bad legacy row would keep that user silently digest-less
-- forever. Expected to touch zero rows today — there is one user and their
-- zone is Australia/Sydney — but it must run before anyone else signs up,
-- and it is idempotent.
update user_settings
   set timezone = 'Australia/Sydney'
 where not daybook_is_valid_timezone(timezone);

-- Read end. One user's bad row can no longer abort the set.
create or replace function due_digests()
returns table (
  user_id     uuid,
  email       text,
  timezone    text,
  local_date  date
)
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select
    us.user_id,
    u.email::text,
    us.timezone,
    ln.local::date as local_date
  from user_settings us
  join auth.users u on u.id = us.user_id
  -- `offset 0` is an optimisation fence, not a no-op: it stops the planner
  -- flattening the subquery and calling daybook_local_now three times per
  -- row. Each call opens a subtransaction for its exception handler, and
  -- three per row across every user every five minutes is worth avoiding.
  -- Correctness does not depend on the fence — the function never raises,
  -- so a NULL simply fails every comparison however often it is evaluated.
  cross join lateral (select daybook_local_now(us.timezone) as local offset 0) ln
  where us.digest_enabled
    and u.email is not null
    and ln.local is not null
    and ln.local::time >= us.digest_send_at
    and (us.digest_last_sent_on is null
         or us.digest_last_sent_on < ln.local::date);
$$;

-- Same treatment. A bad row falls back to the default zone rather than
-- raising, because by the time we are here the user is already selected and
-- returning nothing would mean an empty digest rather than a skipped one.
create or replace function digest_payload(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with days as (
    select ln.local::date as today, ln.local::date - 1 as yesterday
    from user_settings us
    cross join lateral (
      select coalesce(
               daybook_local_now(us.timezone),
               daybook_local_now('Australia/Sydney')
             ) as local
      offset 0
    ) ln
    where us.user_id = p_user_id
  )
  select jsonb_build_object(
    'today', (select today from days),
    'completed_yesterday', coalesce((
      select jsonb_agg(t.text order by t.completed_at)
      from tasks t
      where t.user_id = p_user_id
        and t.scheduled_date = (select yesterday from days)
        and t.completed_at is not null
    ), '[]'::jsonb),
    'carried', coalesce((
      select jsonb_agg(jsonb_build_object('text', t.text, 'count', t.carried_over_count)
                       order by t.carried_over_count desc)
      from tasks t
      where t.user_id = p_user_id
        and t.scheduled_date = (select today from days)
        and t.completed_at is null
        and t.carried_over_count > 0
    ), '[]'::jsonb),
    'today_tasks', coalesce((
      select jsonb_agg(t.text order by t.created_at)
      from tasks t
      where t.user_id = p_user_id
        and t.scheduled_date = (select today from days)
        and t.completed_at is null
    ), '[]'::jsonb)
  );
$$;


-- ============================================================
-- 2. Push subscriptions get their own table.
--    (Phase 7, blocker C1 — the only cross-tenant leak at runtime.)
--
-- user_settings.push_subscription is one JSONB column per user, which
-- assumes a subscription belongs to a user. It does not: it belongs to a
-- BROWSER INSTALL. swPush.requestSubscription() with a fixed VAPID key
-- returns the same endpoint for the same service-worker registration, so:
--
--   - Two accounts on one installed PWA both store that endpoint, and the
--     cron pushes user A's task text to a device user B is now signed in
--     on. RLS is no defence; notify sends as service_role.
--   - One account on two devices silently loses the first, because the
--     second subscribe overwrites the column.
--
-- Both are the same mistake and one table fixes both.
-- ============================================================

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz,
  -- Globally unique, NOT unique per (user_id, endpoint). An endpoint names
  -- one browser install, and an install has exactly one current owner. When
  -- a device changes hands the old row must GO, not sit alongside the new
  -- one — that is the whole bug. See register_push_subscription.
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

create index if not exists push_subscriptions_user_idx
  on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists push_subscriptions_owner on push_subscriptions;
create policy push_subscriptions_owner on push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Registration has to be SECURITY DEFINER, and the reason is exactly the
-- bug being fixed. When a device changes hands the incoming endpoint
-- already has a row owned by the PREVIOUS user, and RLS will not let the
-- new user touch it: an upsert's USING clause is tested against the
-- existing row, which they do not own. Under RLS alone the stale row
-- survives and the leak stays open.
--
-- So the reassignment runs here, where RLS is inert, and the ownership
-- check is hand-written instead: the row is always assigned to auth.uid()
-- and never to a caller-supplied id. Per AGENTS.md this is a signed-in
-- function, so it raises on a null auth.uid() and is revoked from anon and
-- public.
create or replace function register_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_endpoint is null or p_p256dh is null or p_auth is null then
    raise exception 'incomplete push subscription';
  end if;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id      = v_uid,
        p256dh       = excluded.p256dh,
        auth         = excluded.auth,
        created_at   = now(),
        last_sent_at = null
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function register_push_subscription(text, text, text) from anon, public;
grant  execute on function register_push_subscription(text, text, text) to authenticated;

-- Carry across whatever is already stored, so nobody has to re-subscribe.
-- The old column is deliberately left in place rather than dropped: it is
-- the rollback path until the new table has been seen delivering. 0006
-- drops it.
insert into push_subscriptions (user_id, endpoint, p256dh, auth)
select
  us.user_id,
  us.push_subscription ->> 'endpoint',
  us.push_subscription -> 'keys' ->> 'p256dh',
  us.push_subscription -> 'keys' ->> 'auth'
from user_settings us
where us.push_subscription is not null
  and us.push_subscription ->> 'endpoint' is not null
  and us.push_subscription -> 'keys' ->> 'p256dh' is not null
  and us.push_subscription -> 'keys' ->> 'auth' is not null
on conflict (endpoint) do nothing;

comment on column user_settings.push_subscription is
  'DEPRECATED 3 Sep. Superseded by push_subscriptions. Kept as the rollback
   path until the new table is seen delivering; dropped in 0006.';

-- One row per subscription now, not one per user, so a user with two
-- devices gets two rows and notify fans out over them. Returns the
-- subscription id so a 410 Gone can delete that one dead device instead of
-- clearing the user's push entirely — which is what nulling the old column
-- did to anyone with more than one.
--
-- Dropped rather than replaced: `create or replace function` cannot change a
-- return type, and this one gains four columns. The drop also invalidates
-- the old grants, so they are re-issued below.
drop function if exists due_reminders(interval);

create function due_reminders(p_grace interval default interval '15 minutes')
returns table (
  task_id         uuid,
  user_id         uuid,
  text            text,
  reminder_at     timestamptz,
  subscription_id uuid,
  endpoint        text,
  p256dh          text,
  auth            text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.user_id, t.text, t.reminder_at, ps.id, ps.endpoint, ps.p256dh, ps.auth
  from tasks t
  join push_subscriptions ps on ps.user_id = t.user_id
  where t.reminder_at is not null
    and t.reminder_sent_at is null
    and t.completed_at is null
    and t.reminder_at <= now()
    and t.reminder_at > now() - p_grace;
$$;

revoke execute on function due_reminders(interval) from anon, authenticated, public;
grant  execute on function due_reminders(interval) to service_role;


-- ============================================================
-- 3. A wrong device clock can no longer poison history permanently.
--    (Phase 7, item 10 — fixed differently from how the audit proposed.)
--
-- The audit's advice was to clamp the upper bound to v_server. That is
-- wrong and would have been a serious regression: v_server is the UTC date,
-- and Daybook's only user is in Sydney. At 9am on the 4th in Sydney it is
-- still 22:00 on the 3rd in UTC, so clamping to v_server drags the local
-- date back a day every morning, for every user east of UTC.
--
-- The bug is real, though. p_today is accepted up to v_server + 1, so a
-- device a day fast pushes open tasks to tomorrow AND makes the snapshot
-- loop (`while v_day < v_today`) write a row for a still-running today with
-- incomplete counts. Because the next run starts at v_last_snap + 1 and
-- inserts `on conflict do nothing`, that row can never be corrected.
--
-- The right reference is neither the client's date nor UTC but the user's
-- OWN local date, which user_settings.timezone already holds and which
-- section 1 above has just made trustworthy. Two changes:
--
--   - clamp against v_local instead of v_server, so "a day fast" is
--     measured against the user's real local day;
--   - bound the snapshot loop by v_local, so a day is never snapshotted
--     before it has actually closed where the user lives, whatever the
--     client claims.
--
-- The +1 upper bound is kept deliberately. It is what lets someone who has
-- travelled east of their stored timezone keep using the app during the
-- hours their device is a day ahead of their settings; rollover stays
-- permissive, and only the snapshot — the part that is irreversible — is
-- made strict.
-- ============================================================
create or replace function rollover_and_snapshot(p_today date)
returns table (rolled_count int, snapshots_written int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
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
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- The user's own local date. Falls back to UTC when there is no settings
  -- row yet (first open, before ensure_user_setup lands) or the stored zone
  -- is unreadable — daybook_local_now returns null rather than raising, so
  -- rollover cannot be taken down by the same bad value that used to take
  -- down the digest.
  select us.timezone into v_zone from user_settings us where us.user_id = v_uid;
  v_local := coalesce(daybook_local_now(v_zone), now() at time zone 'utc')::date;

  -- 1. clamp the client date against the user's local day, not UTC
  v_today := least(greatest(p_today, v_local - 1), v_local + 1);

  select max(date) into v_last_snap from day_snapshots where user_id = v_uid;
  select min(scheduled_date) into v_min_task from tasks where user_id = v_uid;

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


-- ============================================================
-- 4. The happy path coerces an unknown timezone instead of failing.
--    (Phase 7, blocker 1, write end.)
--
-- The trigger added above raises on a bad zone, which is right for a PATCH
-- from Settings but wrong here: browserTimezone() reports whatever Intl
-- says, and the ICU zone set is not Postgres's. A user whose browser knows
-- a zone Postgres does not would otherwise fail setup entirely and get no
-- account at all. Coerce, do not reject, on the path that runs before the
-- user has had any chance to choose.
-- ============================================================
create or replace function ensure_user_setup(p_timezone text default 'Australia/Sydney')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_zone text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_zone := case
    when daybook_is_valid_timezone(p_timezone) then p_timezone
    else 'Australia/Sydney'
  end;

  insert into user_settings (user_id, timezone)
  values (v_uid, v_zone)
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
-- 5. auth.uid() stops being re-evaluated once per row.
--    (Phase 7, item 8 — four performance advisor findings.)
--
-- Wrapping it in a scalar subquery lets the planner hoist it into an
-- InitPlan evaluated once per query instead of once per row. Invisible at
-- nine tasks; real on a multi-thousand-row range scan, which is what the
-- calendar does. The predicate is otherwise unchanged, so isolation is
-- identical.
-- ============================================================
drop policy if exists tasks_owner on tasks;
create policy tasks_owner on tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists categories_owner on categories;
create policy categories_owner on categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists day_snapshots_owner on day_snapshots;
create policy day_snapshots_owner on day_snapshots
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_settings_owner on user_settings;
create policy user_settings_owner on user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- ============================================================
-- 6. One user deleting a category stops scanning every user's tasks.
--    (Phase 7, item 9.)
--
-- tasks_category_id_fkey is ON DELETE SET NULL with no index behind it, so
-- enforcing it seq-scans tasks — and that scan is not user-scoped.
-- ============================================================
-- Deliberately NOT partial on `category_id is not null`. The saving would be
-- trivial and the consumer here is the FK enforcement plan, not a query we
-- write; relying on the planner proving `category_id = $1` implies
-- `category_id is not null` to reach a partial index is a subtlety with no
-- upside.
create index if not exists tasks_category_idx on tasks (category_id);


-- ============================================================
-- 7. search_path pinned against pg_temp on the functions not already
--    recreated above. (Phase 7, item 13.)
--
-- Postgres searches the temp schema first for relation names when it is not
-- listed, so in principle a pg_temp.tasks could shadow the real one inside
-- a SECURITY DEFINER body. Not exploitable through PostgREST, which exposes
-- no way to create a temp table — this is insurance, not a hole. The
-- functions recreated earlier in this file already carry it.
-- ============================================================
alter function mark_digest_sent(uuid, date)  set search_path = public, pg_temp;
alter function mark_reminder_sent(uuid)      set search_path = public, pg_temp;
