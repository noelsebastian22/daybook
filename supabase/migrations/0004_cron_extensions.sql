-- ============================================================
-- Enables the two extensions the `notify` schedule needs.
--
-- Split out of supabase/cron/schedule-notify.sql so that enabling them is
-- tracked like every other schema change. The schedule itself still is not
-- a migration: its command text carries the service role key, so it stays
-- a by-hand run in the SQL editor and is never committed filled in.
--
-- pg_cron owns the timer. pg_net makes the outbound HTTP call, because
-- pg_cron can only run SQL and the digest lives behind an Edge Function.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;
