-- The access gate: signup becomes per-person instead of global.
--
-- Until now the only control was the Auth dashboard's "Allow new users to
-- sign up" — one switch, everyone or no one. This replaces it with an
-- allowlist consulted by a Before User Created auth hook, so the switch can
-- stay ON while the hook decides case by case. The hook runs inside GoTrue
-- before the auth.users insert and covers *every* provider, which is why it
-- is used rather than `shouldCreateUser: false` in the client: that flag
-- covers the magic-link path and leaves Google OAuth wide open.
--
-- See docs/ACCESS-PLAN.md.

create type public.access_status as enum ('pending', 'approved', 'denied');

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),

  -- Stored lowercase and trimmed, and the constraint is the point. Google
  -- returns a lowercase address; a human typing into a form does not. If a
  -- row were stored as `Noel@x.com` the hook's lowercase lookup would miss
  -- it and an approved person would be rejected — a silent failure that
  -- fails *open* in the worst direction. The check turns that into an error
  -- at write time instead.
  email text not null unique check (email = lower(btrim(email))),

  note text check (note is null or length(note) <= 500),
  status public.access_status not null default 'pending',

  -- sha256 of the token in the approval email, never the token itself. A
  -- database leak must not hand someone the ability to approve accounts.
  -- Cleared once a decision is made, which is what makes it single-use.
  decision_token_hash text,
  token_expires_at timestamptz,

  requested_at timestamptz not null default now(),
  decided_at timestamptz,

  -- Abuse control only, for the per-IP throttle in the Edge Function.
  request_ip inet
);

create index access_requests_status_idx on public.access_requests (status);
create index access_requests_requested_at_idx on public.access_requests (requested_at);

-- RLS on with *no policies at all*, and that is deliberate rather than an
-- oversight. This table has no user_id — it exists before accounts do — so
-- there is no owner to check. Enabled-with-no-policies denies anon and
-- authenticated everything, which is exactly right: the only two things that
-- touch it are the Edge Function (service_role, which bypasses RLS) and the
-- hook below (security definer). Do not add a policy here.
alter table public.access_requests enable row level security;

-- The hook. Returns '{}' to allow the signup, or an error object to refuse it.
--
-- A third category of function for this project, and its grants are the
-- reason. The user-facing RPCs raise on a null auth.uid() and are revoked
-- from anon and public; the cron functions revoke from anon, authenticated
-- and public and grant to service_role. This one grants to
-- supabase_auth_admin — and like the cron functions, an auth.uid() guard
-- would only break it, because there is no session at the moment it runs.
--
-- security definer so it does not depend on whatever supabase_auth_admin
-- happens to be granted on the public schema, with search_path pinned to
-- match the seven functions already here.
create or replace function public.hook_gate_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_status public.access_status;
begin
  v_email := lower(btrim(event -> 'user' ->> 'email'));

  if v_email is null or v_email = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'code', 'daybook_no_email',
        'message', 'An email address is required to sign up.'
      )
    );
  end if;

  select status into v_status
  from public.access_requests
  where email = v_email;

  if v_status = 'approved' then
    return '{}'::jsonb;
  end if;

  -- pending, denied and absent are all the same answer to the person trying
  -- to sign up. Which one it was is Noel's business, not theirs, and saying
  -- would let anyone test whether an address is on the list.
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'code', 'daybook_not_approved',
      'message', 'This email has not been approved for Daybook yet.'
    )
  );
end;
$$;

grant execute on function public.hook_gate_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_gate_signup(jsonb) from authenticated, anon, public;
