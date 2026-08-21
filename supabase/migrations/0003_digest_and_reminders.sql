-- ============================================================
-- Daybook: daily digest and push reminders.
--
-- Both are driven by one pg_cron schedule calling one Edge Function
-- (`notify`), which asks the two functions below what is due right now.
--
-- These two are the first SECURITY DEFINER functions in this schema that
-- are NOT called by a signed-in user. They are called by the Edge Function
-- with the service role, where auth.uid() is null by definition, so the
-- "raise on a null auth.uid()" rule in AGENTS.md cannot apply to them.
-- They are locked down the other way instead: execute is revoked from
-- anon, authenticated and public, and granted to service_role only. A
-- signed-in user cannot call these at all.
-- ============================================================

-- ---------- idempotency markers ----------
-- Without these the cron sends the same digest every five minutes for the
-- whole window, and re-sends every reminder on every tick.

alter table user_settings
  add column if not exists digest_last_sent_on date;

alter table tasks
  add column if not exists reminder_sent_at timestamptz;

-- Only unsent reminders are ever scanned, so the index covers exactly the
-- rows the cron cares about and stays small.
create index if not exists tasks_due_reminder_idx
  on tasks (reminder_at)
  where reminder_at is not null
    and reminder_sent_at is null
    and completed_at is null;

-- ---------- who is due a digest ----------
-- "Due" means: the digest is on, and the user's OWN local clock has passed
-- their send time today, and they have not had one today.
--
-- The local date is the whole reason user_settings.timezone exists. The
-- cron runs in UTC and has no idea when 7am is for anybody.
create or replace function due_digests()
returns table (
  user_id     uuid,
  email       text,
  timezone    text,
  local_date  date
)
language sql
security definer
set search_path = public, auth
as $$
  select
    us.user_id,
    u.email::text,
    us.timezone,
    (now() at time zone us.timezone)::date as local_date
  from user_settings us
  join auth.users u on u.id = us.user_id
  where us.digest_enabled
    and u.email is not null
    and (now() at time zone us.timezone)::time >= us.digest_send_at
    and (us.digest_last_sent_on is null
         or us.digest_last_sent_on < (now() at time zone us.timezone)::date);
$$;

-- ---------- one user's digest content ----------
-- Yesterday's outcome and today's list, in the user's own local days.
create or replace function digest_payload(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with tz as (
    select coalesce(timezone, 'Australia/Sydney') as zone
    from user_settings where user_id = p_user_id
  ),
  days as (
    select
      (now() at time zone (select zone from tz))::date as today,
      (now() at time zone (select zone from tz))::date - 1 as yesterday
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

-- ---------- mark a digest sent ----------
create or replace function mark_digest_sent(p_user_id uuid, p_local_date date)
returns void
language sql
security definer
set search_path = public
as $$
  update user_settings
     set digest_last_sent_on = p_local_date
   where user_id = p_user_id;
$$;

-- ---------- which reminders have come due ----------
-- A grace window, so a reminder whose moment fell between two cron ticks
-- is still sent rather than silently skipped. Anything older than the
-- window is stale — a reminder three hours late is worse than none.
create or replace function due_reminders(p_grace interval default interval '15 minutes')
returns table (
  task_id      uuid,
  user_id      uuid,
  text         text,
  reminder_at  timestamptz,
  subscription jsonb
)
language sql
security definer
set search_path = public
as $$
  select t.id, t.user_id, t.text, t.reminder_at, us.push_subscription
  from tasks t
  join user_settings us on us.user_id = t.user_id
  where t.reminder_at is not null
    and t.reminder_sent_at is null
    and t.completed_at is null
    and us.push_subscription is not null
    and t.reminder_at <= now()
    and t.reminder_at > now() - p_grace;
$$;

create or replace function mark_reminder_sent(p_task_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update tasks set reminder_sent_at = now() where id = p_task_id;
$$;

-- ---------- lock them to the service role ----------
revoke execute on function due_digests()                       from anon, authenticated, public;
revoke execute on function digest_payload(uuid)                from anon, authenticated, public;
revoke execute on function mark_digest_sent(uuid, date)        from anon, authenticated, public;
revoke execute on function due_reminders(interval)             from anon, authenticated, public;
revoke execute on function mark_reminder_sent(uuid)            from anon, authenticated, public;

grant execute on function due_digests()                        to service_role;
grant execute on function digest_payload(uuid)                 to service_role;
grant execute on function mark_digest_sent(uuid, date)         to service_role;
grant execute on function due_reminders(interval)              to service_role;
grant execute on function mark_reminder_sent(uuid)             to service_role;

-- ============================================================
-- The cron schedule is NOT created here.
--
-- It has to carry the service role key in its command text, and that key
-- must never be committed. Run `supabase/cron/schedule-notify.sql` by hand
-- in the SQL editor once, with the key pasted in.
-- ============================================================
